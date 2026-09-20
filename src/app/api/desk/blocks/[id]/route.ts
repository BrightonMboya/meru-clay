import { requireOperatorApi } from '@/lib/admin/session';
import { deleteBlock } from '@/lib/blocks';

export const dynamic = 'force-dynamic';

/** DELETE /api/desk/blocks/:id — reopen a court. ⚠️ Staff endpoint, unauthenticated. */
export async function DELETE(_request: Request, ctx: RouteContext<'/api/desk/blocks/[id]'>) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  const { id } = await ctx.params;
  const numeric = Number(id);
  if (!Number.isInteger(numeric)) return json({ error: 'bad id' }, 400);

  try {
    const lifted = await deleteBlock(numeric);
    if (!lifted) return json({ error: 'That closure has already been lifted.' }, 404);
    return json({ ok: true, id: numeric });
  } catch (err) {
    console.error('reopen failed:', err);
    return json({ error: 'Could not reopen the court.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
