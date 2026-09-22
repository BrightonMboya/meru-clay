import { requireOperatorApi } from '@/lib/admin/session';
import { classLink } from '@/lib/paylink';

export const dynamic = 'force-dynamic';

/**
 * POST /api/desk/enrolments/:id/pay-link — ask for a class place to be paid.
 *
 * Desk-driven, because enrolment is: there is no public class-booking page,
 * so a place is taken at the counter and this is how the club collects for
 * it afterwards. A free session has nothing to charge and is refused.
 *
 * The price is not in the request. It was copied onto the enrolment from
 * `fee` on the class's row in src/lib/schedule.ts when the place was taken,
 * so the desk cannot decide what a class costs — see `priceClass`.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<'/api/desk/enrolments/[id]/pay-link'>,
) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return json({ error: 'Unknown class place.' }, 400);

  const body = (await request.json().catch(() => ({}))) as { send?: boolean };

  try {
    const result = await classLink(id, body.send !== false);
    if (!result.ok) return json({ error: result.error }, 409);

    return json({
      id: result.payment.id,
      url: result.url,
      amount: result.amount,
      sent: result.sent,
      sendError: result.sendError ?? null,
    });
  } catch (err) {
    console.error('class pay link failed:', err);
    return json({ error: 'Could not create a payment link.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
