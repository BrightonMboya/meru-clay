import { loadDesk } from '@/lib/admin/load';
import { requireOperatorApi } from '@/lib/admin/session';
import { isValidDate } from '@/lib/time';

// The desk is a live board — the now-line, the hold countdowns and the day's
// rows all move. Nothing here can be prerendered or cached.
export const dynamic = 'force-dynamic';

/**
 * Staff only.
 *
 * The two prefixes this app keeps its private work behind — /admin and
 * /api/desk — are both matched by src/proxy.ts, which is the single place the
 * note that used to sit here asked for. A request with no session gets a 401
 * from here and a redirect to /admin/login from there.
 *
 * The proxy is the door, not the lock: `matcher` is configuration, and a
 * Server Function is a POST to whatever route it lives on, which a matcher can
 * miss. Anything that reads a player's phone number should also ask
 * `requireOperatorApi` (src/lib/admin/session.ts) for itself.
 */

/**
 * GET /api/desk?date=YYYY-MM-DD
 *
 * The whole day in one payload: timeline blocks, arrivals, the four readings
 * and the week strip. One call, so the numbers along the top, the blocks on
 * the grid and the list down the side cannot tell three different stories.
 */
export async function GET(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

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
