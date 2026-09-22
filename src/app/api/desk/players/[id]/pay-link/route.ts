import { requireOperatorApi } from '@/lib/admin/session';
import { renewalLink } from '@/lib/paylink';

export const dynamic = 'force-dynamic';

/**
 * POST /api/desk/players/:id/pay-link — send a member their renewal link.
 *
 * The desk's half of renewals. The member gets it on WhatsApp; the desk gets
 * the URL back in the response as well, because WhatsApp refuses plain text
 * outside the 24-hour window and somebody at the counter with the member on
 * the phone needs something to read out. See the header of src/lib/paylink.ts.
 *
 * `sent: false` in the response is not a failure of this route — the payment
 * exists and the link works. It means the message did not go, and the screen
 * says so rather than letting the operator assume it did.
 *
 * Body: `{ "send": false }` to mint the link without messaging anybody.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/desk/players/[id]/pay-link'>) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return json({ error: 'Unknown player.' }, 400);

  const body = (await request.json().catch(() => ({}))) as { send?: boolean };

  try {
    const result = await renewalLink(id, body.send !== false);
    if (!result.ok) return json({ error: result.error }, 409);

    return json({
      id: result.payment.id,
      url: result.url,
      amount: result.amount,
      sent: result.sent,
      sendError: result.sendError ?? null,
    });
  } catch (err) {
    console.error('renewal link failed:', err);
    return json({ error: 'Could not create a renewal link.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
