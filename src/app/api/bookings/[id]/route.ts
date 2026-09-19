import { courtName } from '@/lib/availability';
import { cancelOwnBooking, getBookingDetail } from '@/lib/bookings';
import { fmtLongDay, fmtRange, nowLocal } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * A player's view of their own booking.
 *
 * The id is a v4 UUID that appears nowhere but in their confirmation, so
 * holding it is the authorisation — the same shape as an unsubscribe link.
 * Notes and the internal amount are left out: this is what the player needs
 * to see, not the desk's copy of the row.
 */
function publicView(b: NonNullable<Awaited<ReturnType<typeof getBookingDetail>>>) {
  return {
    id: b.id,
    reference: b.id.slice(0, 8),
    court: b.court_id,
    courtName: courtName(b.court_id),
    date: b.date,
    day: fmtLongDay(b.date),
    when: fmtRange(b.start_min, b.end_min),
    start: b.start_min,
    end: b.end_min,
    coach: b.coach === 1,
    status: b.status,
    paid: b.paid,
    amount: b.amount,
    /** Epoch ms the hold dies. null once confirmed or cancelled. */
    expiresAt: b.status === 'held' ? b.expires_at : null,
  };
}

/** GET /api/bookings/:id — look up a booking from its confirmation link. */
export async function GET(_request: Request, ctx: RouteContext<'/api/bookings/[id]'>) {
  const { id } = await ctx.params;

  try {
    const booking = await getBookingDetail(id);
    if (!booking) return json({ error: 'No such booking.' }, 404);
    return json(publicView(booking));
  } catch (err) {
    console.error('booking lookup failed:', err);
    return json({ error: 'Could not load that booking.' }, 500);
  }
}

/**
 * DELETE /api/bookings/:id — the player releases their own court.
 *
 * Someone who changes their mind five minutes after booking should not have
 * to phone the club, and a slot given back is a slot the club can resell.
 */
export async function DELETE(_request: Request, ctx: RouteContext<'/api/bookings/[id]'>) {
  const { id } = await ctx.params;

  try {
    const result = await cancelOwnBooking(id, nowLocal().epochMs);
    if (!result.ok) {
      return json(
        { error: result.reason === 'missing' ? 'No such booking.' : 'That booking is already over.' },
        result.reason === 'missing' ? 404 : 409,
      );
    }
    return json({ ok: true, id });
  } catch (err) {
    console.error('self-cancel failed:', err);
    return json({ error: 'Could not cancel that booking.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
