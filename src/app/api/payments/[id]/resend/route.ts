import { getPayment, recordEvent } from '@/lib/payments';
import { settle } from '@/lib/settle';
import { isCompleted, isDead, isRefunded, resendPush, verifyPayment } from '@/lib/snippe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/:id/resend — "I never got the prompt".
 *
 * A prompt that is not answered times out on the handset in a minute or so,
 * but Snippe keeps the transaction 'pending' for hours, and so the payment
 * sits at 'processing' and `beginAttempt` rightly refuses to start another.
 * Without this the payer is left on "check your phone" with nothing coming.
 *
 * It re-pushes the SAME transaction rather than starting a new one: a fresh
 * attempt would leave the first prompt approvable too, which is exactly how
 * a payer ends up charged twice. Asks Snippe first, so a prompt that was
 * in fact approved (or has died) is settled instead of pushed again.
 *
 * Same authorisation as the rest of /api/payments/:id — holding the UUID.
 */
export async function POST(_request: Request, ctx: RouteContext<'/api/payments/[id]/resend'>) {
  const { id } = await ctx.params;

  const payment = await getPayment(id);
  if (!payment) return json({ error: 'No such payment.' }, 404);
  if (payment.status !== 'processing' || !payment.providerRef) {
    return json({ error: 'There is no payment request out to send again.' }, 409);
  }

  // Best effort on a serverless host, as `asked` is in ../route.ts; the page
  // also holds the button back, and Snippe has its own limits.
  const last = sent.get(id) ?? 0;
  if (Date.now() - last < RESEND_EVERY_MS) {
    return json({ error: 'We have just sent it. Give it a few seconds to arrive.' }, 429);
  }
  sent.set(id, Date.now());

  const now = await verifyPayment(payment.providerRef);
  if (now.ok && (isCompleted(now.status) || isDead(now.status) || isRefunded(now.status))) {
    await settle(id, payment.providerRef, 'verify');
    return json({ ok: true, settled: true });
  }

  const pushed = await resendPush(payment.providerRef);

  await recordEvent({
    paymentId: id,
    source: 'checkout',
    event: pushed.ok ? 'push.resent' : 'push.refused',
    providerRef: payment.providerRef,
    status: now.ok ? now.status : null,
    amount: payment.amount,
    raw: pushed,
  });

  if (!pushed.ok) return json({ error: pushed.error }, 502);
  return json({ ok: true, settled: false });
}

const sent = new Map<string, number>();
const RESEND_EVERY_MS = 20_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
