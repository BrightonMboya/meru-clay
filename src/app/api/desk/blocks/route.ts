import { requireOperatorApi } from '@/lib/admin/session';
import { COURTS } from '@/lib/availability';
import { createBlock, parseCourt, validBlockWindow } from '@/lib/blocks';
import { isValidDate } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * POST /api/desk/blocks — close a court.
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

  const court = parseCourt(body.court, COURTS.map((c) => c.id));
  if (court === undefined) return json({ error: 'Unknown court.' }, 400);

  if (!isValidDate(body.date)) return json({ error: 'Pick a date.' }, 400);

  const start = Number(body.start);
  const end = Number(body.end);
  if (!validBlockWindow(start, end)) {
    return json({ error: 'The closure must end after it starts, inside opening hours.' }, 400);
  }

  const reason = String(body.reason ?? '').trim();
  if (reason.length > 80) return json({ error: 'That reason is too long.' }, 400);

  try {
    const block = await createBlock({ court, date: body.date, start, end, reason });
    return json(block, 201);
  } catch (err) {
    console.error('block failed:', err);
    return json({ error: 'Could not close the court.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
