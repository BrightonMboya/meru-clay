import { loadDesk } from '@/lib/admin/load';
import { isValidDate } from '@/lib/time';

// The desk is a live board — the now-line, the hold countdowns and the day's
// rows all move. Nothing here can be prerendered or cached.
export const dynamic = 'force-dynamic';

/**
 * ⚠️ NO AUTHENTICATION.
 *
 * Every route under /api/desk, and every page under /admin, is reachable by
 * anyone who knows the path. They can read the day's players and phone
 * numbers, confirm or cancel bookings, and close courts. That is fine for
 * local work and is NOT fine in production.
 *
 * The fix is one middleware matching `/admin/:path*` and `/api/desk/:path*`;
 * everything staff-only was deliberately put under those two prefixes so it
 * can be added in a single place. Nothing else has to move.
 */

/**
 * GET /api/desk?date=YYYY-MM-DD
 *
 * The whole day in one payload: timeline blocks, arrivals, the four readings
 * and the week strip. One call, so the numbers along the top, the blocks on
 * the grid and the list down the side cannot tell three different stories.
 */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date');
  if (date !== null && !isValidDate(date)) return json({ error: 'bad date' }, 400);

  try {
    return json(await loadDesk(date ?? undefined));
  } catch (err) {
    console.error('desk failed:', err);
    return json({ error: 'Could not load the day.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
