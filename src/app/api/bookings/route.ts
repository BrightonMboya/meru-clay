import { after } from 'next/server';
import {
  COURTS,
  courtName,
  earliestStart,
  freeSlots,
  isValidStart,
  occupancy,
} from '@/lib/availability';
import { blocksOn, createBooking, liveBookings } from '@/lib/bookings';
import { notifyBooking, notifyEnv } from '@/lib/notify';
import { packBalance } from '@/lib/packs';
import { createPayment } from '@/lib/payments';
import { playerByPhone } from '@/lib/players';
import { totalFor } from '@/lib/pricing';
import { emailFor } from '@/lib/purchase';
import { normalisePhone } from '@/lib/roster';
import {
  BOOKING_WINDOW_DAYS,
  DURATIONS,
  HOLD_MINUTES,
  addDays,
  fmtRange,
  isValidDate,
  nowLocal,
  type Duration,
} from '@/lib/time';
import { errorFields, log, withAxiom } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings — claim a slot. 409 if somebody else got it first.
 *
 * Two ways to have it, and both settle on this page rather than at the desk:
 *
 *   PAY — the slot is held for `HOLD_MINUTES` and a payment is opened for
 *   the booking's own `amount`. The response carries the payment id; the
 *   page sends the mobile money prompt and moves to /pay/<id>, and the
 *   booking is confirmed by `fulfil` once the money lands. A hold nobody
 *   pays for lapses on its own and frees the slot.
 *
 *   PACK — a member books with a session they have already paid for. The
 *   member is found by the number they typed, the booking goes in confirmed,
 *   and one session is spent in the same transaction — see `createBooking`.
 */
export const POST = withAxiom(async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const v = validate(body);
  if ('error' in v) return json({ error: v.error }, 400);

  const now = nowLocal();

  try {
    // Re-check availability server-side. This does not make the write safe — the
    // insert does that — but it turns the common case into a clean message
    // instead of a constraint violation, and it stops a hand-rolled request from
    // booking over a scheduled clinic.
    const [bookings, blocks] = await Promise.all([
      liveBookings(v.date, now.epochMs),
      blocksOn(v.date),
    ]);
    const open = freeSlots(
      v.duration,
      occupancy(v.date, bookings, blocks, { withCoach: v.coach }),
      earliestStart(v.date, 60, now),
    );
    const offered = open.some((s) => s.court === v.court && s.start === v.start);
    if (!offered) return json({ error: 'That slot is no longer free.', slots: open }, 409);

    const member = v.pack ? await playerByPhone(v.phone) : null;
    if (v.pack && !member) {
      log.warn('booking.member_not_found', { date: v.date });
      return json({ error: 'We could not find sessions on that number.' }, 404);
    }

    const result = await createBooking(
      {
        court: v.court,
        date: v.date,
        start: v.start,
        duration: v.duration,
        name: member?.name ?? v.name,
        phone: v.phone,
        email: v.email,
        notes: v.notes,
        coach: v.coach,
        packPlayerId: member?.id,
      },
      now.epochMs,
    );

    if (!result.ok && result.reason === 'no-sessions') {
      log.info('booking.no_sessions', { playerId: member?.id });
      return json({ error: 'You have no sessions left. Pay for this one, or top up.' }, 409);
    }

    if (!result.ok) {
      const fresh = freeSlots(
        v.duration,
        occupancy(v.date, await liveBookings(v.date, now.epochMs), blocks, {
          withCoach: v.coach,
        }),
        earliestStart(v.date, 60, now),
      );
      return json({ error: 'Somebody just took that slot.', slots: fresh }, 409);
    }

    const booking = result.booking;

    // A session booking is confirmed already, so the club and coach hear now.
    // A paid one is announced by `settle` once the money lands — an unpaid
    // hold may never become a booking. Either way, after the response.
    let paymentId: string | null = null;
    let left: number | null = null;
    if (member) {
      after(() => notifyBooking(notifyEnv(), booking));
      left = (await packBalance(member.id)).left;
      log.info('booking.pack_spent', {
        bookingId: booking.id,
        playerId: member.id,
        left,
        court: booking.court_id,
        date: booking.date,
        minutes: v.duration,
      });
    } else {
      // The hold and the link die together. Priced from the same list
      // `createBooking` priced the row from — see src/lib/purchase.ts.
      const payment = await createPayment({
        purpose: 'booking',
        amount: totalFor(v.duration, v.coach),
        bookingId: booking.id,
        name: booking.name,
        phone: booking.phone,
        email: emailFor(booking.email, booking.id),
        expiresAt: new Date(now.epochMs + HOLD_MINUTES * 60_000),
      });
      paymentId = payment.id;
      log.info('booking.held_for_payment', {
        bookingId: booking.id,
        paymentId,
        amount: payment.amount,
        court: booking.court_id,
        date: booking.date,
        minutes: v.duration,
        coach: v.coach,
      });
    }

    return json(
      {
        id: booking.id,
        reference: booking.id.slice(0, 8),
        court: booking.court_id,
        courtName: courtName(booking.court_id),
        date: booking.date,
        when: fmtRange(booking.start_min, booking.end_min),
        coach: booking.coach === 1,
        status: booking.status,
        paymentId,
        /** Sessions left after this one, for a member who booked with one. */
        left,
      },
      201,
    );
  } catch (err) {
    log.error('booking.failed', errorFields(err));
    return json({ error: 'Could not complete the booking. Please try again.' }, 500);
  }
});

type Valid = {
  court: number;
  date: string;
  start: number;
  duration: Duration;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  coach: boolean;
  /** Book with a session from the pack on this number, instead of paying. */
  pack: boolean;
};

function validate(b: Record<string, unknown>): Valid | { error: string } {
  const court = Number(b.court);
  if (!COURTS.some((c) => c.id === court)) return { error: 'Unknown court.' };

  if (!isValidDate(b.date)) return { error: 'Pick a date.' };
  const date = b.date;

  const today = nowLocal().date;
  if (date < today) return { error: 'That date has passed.' };
  if (date > addDays(today, BOOKING_WINDOW_DAYS - 1)) {
    return { error: `Bookings open ${BOOKING_WINDOW_DAYS} days ahead.` };
  }

  const duration = Number(b.duration);
  if (!DURATIONS.includes(duration as Duration)) return { error: 'Pick a duration.' };

  const coach = b.coach === true || b.coach === 1 || b.coach === '1';

  const start = Number(b.start);
  // Court-aware: court 2 has no floodlights and stops at dusk.
  if (!isValidStart(start, duration, court)) return { error: 'Pick a start time.' };

  const pack = b.pack === true;

  // A member's name comes off the roster; only a payer has to type one.
  const name = String(b.name ?? '').trim();
  if (!pack && (name.length < 2 || name.length > 80)) return { error: 'Enter your name.' };

  // Tanzanian mobiles, typed any of the ways people type them.
  const phone = normalisePhone(String(b.phone ?? ''));
  if (!phone) return { error: 'Enter a valid phone number.' };

  const emailRaw = String(b.email ?? '').trim();
  if (emailRaw && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(emailRaw)) {
    return { error: 'That email does not look right.' };
  }

  const notesRaw = String(b.notes ?? '').trim();
  if (notesRaw.length > 300) return { error: 'Notes are too long.' };

  return {
    court,
    date,
    start,
    duration: duration as Duration,
    name,
    phone,
    email: emailRaw || null,
    notes: notesRaw || null,
    coach,
    pack,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
