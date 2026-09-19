import { unenrol } from '@/lib/enrolments';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/desk/enrolments/:id — give up a place in a class.
 *
 * The row is marked cancelled rather than deleted, so the register still shows
 * what was given up. Already-cancelled places 404 rather than reporting a
 * second success.
 *
 * ⚠️ Staff endpoint. Nothing under /api/desk is authenticated yet; see the
 * note in src/app/api/desk/route.ts.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return json({ error: 'Unknown place.' }, 400);

  const dropped = await unenrol(id);
  if (!dropped) return json({ error: 'That place is already gone.' }, 404);

  return json({ ok: true });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
