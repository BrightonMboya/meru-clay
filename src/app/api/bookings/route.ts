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
import {
  BOOKING_WINDOW_DAYS,
  DURATIONS,
  addDays,
  fmtRange,
  isValidDate,
  nowLocal,
  type Duration,
} from '@/lib/time';

export const dynamic = 'force-dynamic';

/** POST /api/bookings — claim a slot. 409 if somebody else got it first. */
export async function POST(request: Request) {
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

    const result = await createBooking(
      {
        court: v.court,
        date: v.date,
        start: v.start,
        duration: v.duration,
        name: v.name,
        phone: v.phone,
        email: v.email,
        notes: v.notes,
        coach: v.coach,
      },
      now.epochMs,
    );

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

    // Booking is committed. Notifications must not delay or fail the response,
    // so they run after it has been flushed to the player.
    const booking = result.booking;
    after(() => notifyBooking(notifyEnv(), booking));

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
      },
      201,
    );
  } catch (err) {
    console.error('booking failed:', err);
    return json({ error: 'Could not complete the booking. Please try again.' }, 500);
  }
}

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

  const name = String(b.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return { error: 'Enter your name.' };

  // Tanzanian mobiles, typed as 07xxxxxxxx / +2557xxxxxxxx / 2557xxxxxxxx.
  const phoneRaw = String(b.phone ?? '').replace(/[\s-]/g, '');
  if (!/^(\+?255|0)[67]\d{8}$/.test(phoneRaw)) return { error: 'Enter a valid phone number.' };
  const phone = phoneRaw.replace(/^(\+?255|0)/, '+255');

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
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
