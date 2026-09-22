import { after } from 'next/server';

import { paymentIdFrom } from '@/lib/checkout';
import { paymentByProviderRef, paymentByTxRef, recordEvent } from '@/lib/payments';
import { settle } from '@/lib/settle';
import { readEvent, verifyWebhook } from '@/lib/snippe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/webhook — where Snippe reports back.
 *
 * Snippe is the club's payment provider; src/lib/snippe.ts is the only file
 * that knows how it talks, and this route is the only place it talks to us.
 *
 * ── What arrives here is a nudge, not evidence ───────────────────────────
 * The signature check below proves the delivery came from Snippe. It does
 * NOT prove the delivery is current — deliveries are retried up to five
 * times over twenty-four minutes and can arrive out of order — and it does
 * not prove the transaction says what the body says. So nothing here
 * settles anything. The body is used for exactly two things: working out
 * which payment it concerns, and writing the delivery down. Then `settle`
 * goes and asks Snippe's own API, and only that answer moves money in the
 * ledger. See src/lib/settle.ts.
 *
 * ── Answering fast ───────────────────────────────────────────────────────
 * Snippe wants a 2xx within thirty seconds and retries until it gets one.
 * Verifying and fulfilling involves a round trip to their API and a
 * transaction with an advisory lock, so it happens in `after()` and the
 * response does not wait on it. A retry meanwhile is harmless: the event
 * row is absorbed by `uniq_payment_event_id`, and `settle` is idempotent
 * from top to bottom.
 *
 * ── The two ways home ────────────────────────────────────────────────────
 * Snippe mints its own `reference` and has no field for one of ours, so the
 * route home is the metadata we sent with the charge: `tx_ref` comes back
 * verbatim and `paymentIdFrom` reads the payment id out of it. Matching on
 * the tx_ref rather than on equality with the row's latest one is
 * deliberate — `txRefFor` mints one per attempt and a late delivery about
 * attempt 1 must still find its payment. Failing that, the provider's
 * reference is looked up directly, because we stored it when we charged.
 *
 * A delivery that matches neither is still written down with a null
 * payment. Money moving that this system cannot account for is the most
 * interesting kind of event there is, and dropping it would destroy the
 * only evidence.
 */
export async function POST(request: Request) {
  // The raw bytes, kept raw. The signature is over exactly what Snippe
  // sent; parsing and re-serialising reorders keys and breaks it.
  const raw = await request.text();

  const signed = verifyWebhook(
    raw,
    request.headers.get('x-webhook-signature'),
    request.headers.get('x-webhook-timestamp'),
  );

  if (!signed.ok) {
    // 401 rather than 200: this is not a delivery we are acknowledging.
    // Snippe will retry, which is what we want if the cause is a signing
    // key we have only just set.
    console.error(`payment webhook refused — ${signed.why}`);
    return new Response('unauthorised', { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response('expected JSON', { status: 400 });
  }

  const hook = readEvent(body);

  const byTxRef = hook.txRef ? await paymentByTxRef(hook.txRef) : null;
  const byRef = byTxRef ?? (hook.reference ? await paymentByProviderRef(hook.reference) : null);
  const paymentId = byRef?.id ?? (hook.txRef ? paymentIdFrom(hook.txRef) : null);

  await recordEvent({
    paymentId,
    source: 'webhook',
    event: hook.type,
    eventId: hook.eventId,
    providerRef: hook.reference,
    status: hook.status,
    amount: hook.amount,
    raw,
  });

  if (!paymentId) {
    console.error(
      `payment webhook could not be matched: ${hook.type} / ${hook.reference ?? '—'}. ` +
        'The delivery is in payment_events with a null payment_id.',
    );
  } else if (!hook.reference) {
    // Without Snippe's reference there is nothing to verify against, and
    // this route does not settle on a body alone. The sweep will pick the
    // payment up from the ledger, where the reference already is.
    console.error(`payment webhook for ${paymentId} carried no provider reference.`);
  } else {
    const reference = hook.reference;
    after(async () => {
      try {
        const result = await settle(paymentId, reference, 'webhook');
        if (result.outcome === 'unknown') {
          console.error(`payment ${paymentId}: webhook settle inconclusive — ${result.reason}`);
        } else if (result.outcome === 'blocked' || result.outcome === 'duplicate') {
          // `settle` has already flagged the row and raised the alarm; this
          // is the line that makes it findable in the deployment's logs.
          console.error(`payment ${paymentId}: ${result.outcome} — ${result.reason}`);
        }
      } catch (err) {
        // Swallowed on purpose: the response has already gone, and the
        // cron sweep re-verifies anything left at 'processing'. Throwing
        // here would only produce an unhandled rejection.
        console.error(`payment ${paymentId}: settling after webhook threw:`, err);
      }
    });
  }

  // 200 either way. Retrying will not make an unmatched delivery matchable,
  // and the row above is the record the club needs in order to go and look.
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
