import { revokeInvite } from '@/lib/admin/invites';
import { requireOperatorApi } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/desk/invites/[id] — withdraw an invitation.
 *
 * Deleting the row is what takes the permission away: a magic link already in
 * someone's inbox stays cryptographically valid, and is refused on arrival
 * because `validateUserInfo` finds no invitation behind it.
 */
export async function DELETE(_request: Request, ctx: RouteContext<'/api/desk/invites/[id]'>) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'bad id' }, 400);

  try {
    if (!(await revokeInvite(id))) return json({ error: 'No such invitation.' }, 404);
    return json({ ok: true });
  } catch (err) {
    console.error('invite revoke failed:', err);
    return json({ error: 'Could not withdraw the invitation.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
