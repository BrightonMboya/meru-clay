import { requireOperatorApi } from '@/lib/admin/session';
import { joiningLink } from '@/lib/paylink';
import { isMembership } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

/**
 * POST /api/desk/leads/:id/pay-link — send an enquiry a joining link.
 *
 * The last step of the leads board: somebody who has come for a trial and
 * said yes can be sent the first term to pay for, and paying it puts them on
 * the roster and marks the lead joined — see `applyJoin` in src/lib/fulfil.ts.
 * Nobody has to retype their name.
 *
 * The tier comes from the desk rather than from the lead, because a lead has
 * no membership column: choosing one is part of signing them up.
 *
 * Body: `{ tier: 'monthly' | 'term', send?: boolean }`.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/desk/leads/[id]/pay-link'>) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return json({ error: 'Unknown enquiry.' }, 400);

  const body = (await request.json().catch(() => ({}))) as { tier?: unknown; send?: boolean };
  if (!isMembership(body.tier)) return json({ error: 'Choose a membership.' }, 400);

  try {
    const result = await joiningLink(id, body.tier, body.send !== false);
    if (!result.ok) return json({ error: result.error }, 409);

    return json({
      id: result.payment.id,
      url: result.url,
      amount: result.amount,
      sent: result.sent,
      sendError: result.sendError ?? null,
    });
  } catch (err) {
    console.error('joining link failed:', err);
    return json({ error: 'Could not create a joining link.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
