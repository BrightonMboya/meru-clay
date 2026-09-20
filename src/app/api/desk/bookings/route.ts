import {
  COURTS,
  conflictAt,
  courtName,
  freeSlots,
  isValidStart,
  occupancy,
} from '@/lib/availability';
import { requireOperatorApi } from '@/lib/admin/session';
import { blocksOn, createBooking, liveBookings } from '@/lib/bookings';
import { DURATIONS, fmtRange, isValidDate, nowLocal, type Duration } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * POST /api/desk/bookings — a booking taken at the counter or over the phone.
 *
 * Deliberately not the same rules as /api/bookings:
 *
 *   - No notice window. A walk-in is standing at the desk now; /book's
 *     hour of notice exists to stop a player booking a court they cannot
 *     reach in time, which does not apply to somebody already here.
 *   - No hold. The player is present, so the row goes in 'confirmed' with no
 *     expiry — there is nothing for the coach to confirm later.
 *   - Email and phone are optional-ish: a walk-in may only give a first name.
 *
 * What it does NOT relax is what is actually in the way. The desk is checked
 * against the same occupancy /book is — other bookings, club sessions and
 * any closure the desk itself drew — and is told which of them is blocking,
 * rather than being allowed to quietly book over a session.
 * `createBooking` then takes the same advisory lock and overlap test on top.
 *
 * ⚠️ Staff endpoint. Nothing under /api/desk is authenticated yet; see the
 * note in src/app/api/desk/route.ts.
 */
export async function POST(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const court = Number(body.court);
  if (!COURTS.some((c) => c.id === court)) return json({ error: 'Unknown court.' }, 400);

  if (!isValidDate(body.date)) return json({ error: 'Pick a date.' }, 400);
  const date = body.date;

  const duration = Number(body.duration);
  if (!DURATIONS.includes(duration as Duration)) return json({ error: 'Pick a duration.' }, 400);

  const start = Number(body.start);
  if (!isValidStart(start, duration, court)) return json({ error: 'Pick a start time.' }, 400);

  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return json({ error: 'Enter a name.' }, 400);

  // Looser than /book: the desk often has only a scribbled number, and an
  // empty one is better than a refused booking for somebody standing there.
  const phoneRaw = String(body.phone ?? '').replace(/[\s-]/g, '');
  if (phoneRaw && !/^(\+?255|0)[67]\d{8}$/.test(phoneRaw)) {
    return json({ error: 'That phone number does not look right.' }, 400);
  }
  const phone = phoneRaw ? phoneRaw.replace(/^(\+?255|0)/, '+255') : '';

  const coach = body.coach === true || body.coach === 1 || body.coach === '1';
  const paid = body.paid === true || body.paid === 1 || body.paid === '1';
  const notes = String(body.notes ?? '').trim().slice(0, 300);

  const now = nowLocal();

  try {
    // Everything already on that court, then the one question the desk is
    // asking: is this exact window clear?
    const [dayBookings, dayBlocks] = await Promise.all([
      liveBookings(date, now.epochMs),
      blocksOn(date),
    ]);
    const blocking = conflictAt(
      court,
      start,
      start + duration,
      occupancy(date, dayBookings, dayBlocks, { withCoach: coach }),
    );
    if (blocking) {
      return json({ error: `That court is not free then — ${blocking.toLowerCase()}.` }, 409);
    }

    const result = await createBooking(
      {
        court,
        date,
        start,
        duration,
        name,
        phone,
        email: null,
        notes: notes || null,
        coach,
        confirmed: true,
        paid,
      },
      now.epochMs,
    );

    if (!result.ok) {
      // Somebody claimed it between the check above and the write. Hand back
      // what is still free so the form can re-offer it.
      const open = freeSlots(
        duration as Duration,
        occupancy(date, await liveBookings(date, now.epochMs), dayBlocks, { withCoach: coach }),
      );
      return json({ error: 'Somebody just took that slot.', slots: open }, 409);
    }

    const booking = result.booking;
    return json(
      {
        id: booking.id,
        reference: booking.id.slice(0, 8),
        court: booking.court_id,
        courtName: courtName(booking.court_id),
        date: booking.date,
        when: fmtRange(booking.start_min, booking.end_min),
        status: booking.status,
      },
      201,
    );
  } catch (err) {
    console.error('desk booking failed:', err);
    return json({ error: 'Could not save the booking.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
