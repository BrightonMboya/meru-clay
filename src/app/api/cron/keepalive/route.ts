import { timingSafeEqual } from 'node:crypto';

import { sql } from '@/lib/db/client';
import { errorFields, log, withAxiom } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/keepalive — one trivial query a night.
 *
 * Supabase pauses a free-tier project after a week without activity, and a
 * paused database takes the whole site down with it. Vercel Cron calls this
 * once a day (see vercel.json) so there is never a quiet week. It reads
 * nothing and changes nothing.
 *
 * Vercel sends `authorization: Bearer $CRON_SECRET` on cron requests, the
 * same secret /api/cron/payments checks.
 */
export const GET = withAxiom(async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected ?? '');
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response('unauthorised', { status: 401 });
  }

  try {
    await sql`select 1`;
  } catch (err) {
    log.error('cron.database_unreachable', errorFields(err));
    return new Response('database unreachable', { status: 500 });
  }

  return new Response('ok', { headers: { 'cache-control': 'no-store' } });
});
