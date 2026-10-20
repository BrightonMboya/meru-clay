import { packBalance } from '@/lib/packs';
import { playerByPhone } from '@/lib/players';
import { normalisePhone } from '@/lib/roster';
import { errorFields, log, withAxiom } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * POST /api/members/lookup — "how many sessions do I have left?"
 *
 * The booking page asks this as a member types the number they paid from, so
 * they can book with a session instead of paying. Any spelling of a Tanzanian
 * mobile is accepted — see `normalisePhone`.
 *
 * ── What this gives away, deliberately ───────────────────────────────────
 * /api/join and /api/renew are written so that nobody can test numbers
 * against the roster. This route cannot be, because answering "you have five
 * sessions left" to whoever typed the number is the whole feature. So it says
 * as little as that needs: a first name, so the member knows it is them, and
 * the count. No surname, no other number, nothing about bookings.
 */
export const POST = withAxiom(async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const phone = normalisePhone(String(body.phone ?? ''));
  if (!phone) return json({ error: 'Enter the number you paid with.' }, 400);

  try {
    const player = await playerByPhone(phone);
    if (!player) {
      log.info('member.lookup', { found: false });
      return json({ found: false });
    }

    const balance = await packBalance(player.id);
    log.info('member.lookup', { found: true, playerId: player.id, left: balance.left });
    return json({
      found: true,
      firstName: player.name.trim().split(/\s+/)[0],
      ...balance,
    });
  } catch (err) {
    log.error('member.lookup_failed', errorFields(err));
    return json({ error: 'Could not look that number up. Please try again.' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
