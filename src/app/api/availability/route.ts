import { earliestStart, freeSlots, occupancy } from '@/lib/availability';
import { blocksOn, liveBookings } from '@/lib/bookings';
import { DURATIONS, isValidDate, nowLocal, type Duration } from '@/lib/time';

// Availability depends on the wall clock, so it can never be prerendered or
// cached at the route level.
export const dynamic = 'force-dynamic';

/**
 * GET /api/availability?date=YYYY-MM-DD&duration=60
 *
 * Advisory: what to render. The booking write decides what is actually free.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  const date = url.searchParams.get('date');
  const duration = Number(url.searchParams.get('duration') ?? 60);
  // A coached session needs the coach free too, which rules out more times.
  const withCoach = url.searchParams.get('coach') === '1';

  if (!isValidDate(date)) return json({ error: 'bad date' }, 400);
  if (!DURATIONS.includes(duration as Duration)) return json({ error: 'bad duration' }, 400);

  const now = nowLocal();
  if (date < now.date) return json({ date, duration, coach: withCoach, slots: [] });

  let slots;
  try {
    const [bookings, blocks] = await Promise.all([
      liveBookings(date, now.epochMs),
      blocksOn(date),
    ]);
    slots = freeSlots(
      duration as Duration,
      occupancy(date, bookings, blocks, { withCoach }),
      earliestStart(date, 60, now),
    );
  } catch (err) {
    console.error('availability failed:', err);
    return json({ error: 'Could not load times.' }, 500);
  }

  return json({ date, duration, coach: withCoach, slots }, 200);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // Availability goes stale the moment somebody books; never cache it.
      'cache-control': 'no-store',
    },
  });
}
