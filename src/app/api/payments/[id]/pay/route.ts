import { after } from 'next/server';

import { txRefFor } from '@/lib/checkout';
import {
  attachProviderRef,
  beginAttempt,
  getPayment,
  markFailed,
  markUnfulfillable,
  recordEvent,
} from '@/lib/payments';
import { describePayment } from '@/lib/purchase';
import { chargeMobileMoney, snippeConfigured, toMsisdn } from '@/lib/snippe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/:id/pay — push a mobile money prompt to a handset.
 *
 * The payer's half of /pay/[id]. They type the number they want to pay
 * from, this asks Snippe to send a USSD prompt to it, and the page starts
 * polling `GET /api/payments/:id` while they find their PIN.
 *
 * The id is a v4 UUID that appears only in the link the club sent them, so
 * holding it is the authorisation — the same arrangement `/api/bookings/[id]`
 * documents at length. Worth being clear about what that does and does not
 * permit: somebody with the link can cause a payment prompt to be sent to a
 * phone number of their choosing, for an amount they cannot change, payable
 * to the club. The failure mode is a stranger being pestered by a USSD
 * prompt they can decline, not money moving anywhere it should not.
 *
 * ── The amount is not in the request ─────────────────────────────────────
 * It is read from the ledger row, which `createPayment` wrote from
 * src/lib/pricing.ts at the time the link was minted. A client that posts
 * `{ phone, amount: 1 }` is charged what it owes; the extra key is ignored.
 * See the header of src/lib/purchase.ts, which exists to hold this rule.
 *
 * ── Two taps ─────────────────────────────────────────────────────────────
 * `beginAttempt` is a compare-and-swap that moves the row to 'processing'
 * and bumps the attempt in one statement, so a double-submitted form sends
 * one prompt and the second tap is told a request is already out. The
 * status moves BEFORE Snippe is called, and is walked back only for a
 * refusal Snippe actually admitted to — the ordering that cannot lose a
 * charge whose response went missing.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/payments/[id]/pay'>) {
  const { id } = await ctx.params;

  if (!snippeConfigured()) {
    console.error('SNIPPE_API_KEY is unset — /pay cannot take money.');
    return json({ error: 'Mobile money is not switched on yet. Please pay at the court.' }, 503);
  }

  let body: { phone?: unknown };
  try {
    body = (await request.json()) as { phone?: unknown };
  } catch {
    return json({ error: 'Expected JSON.' }, 400);
  }

  const phone = typeof body.phone === 'string' ? body.phone : '';
  if (!toMsisdn(phone)) {
    return json({ error: 'Enter a Tanzanian mobile number, like 0712 345 678.' }, 400);
  }

  const existing = await getPayment(id);
  if (!existing) return json({ error: 'No such payment.' }, 404);

  const started = await beginAttempt(id, txRefFor);
  if (!started.ok) {
    // 409 is "somebody beat you to it" throughout this codebase, and both
    // of the cases here are that: already paid, or a prompt already out.
    return json({ error: started.reason }, 409);
  }

  const payment = started.payment;
  const { title } = await describePayment(payment);

  const charge = await chargeMobileMoney({
    paymentId: payment.id,
    txRef: payment.txRef ?? txRefFor(payment.id, payment.attempt),
    attempt: payment.attempt,
    amount: payment.amount,
    phone,
    name: payment.name,
    email: payment.email,
    description: title,
  });

  if (!charge.ok) {
    /*
     * Two quite different failures, and telling them apart is the whole
     * point of `resolved` — see the note on `ChargeResult`.
     *
     * A RESOLVED refusal means Snippe did not act: a number on the wrong
     * network, an amount under their floor, a validation error. Nothing was
     * charged, so the payment goes back to 'failed' — a state `beginAttempt`
     * lets them try again from — and the reason is shown to them verbatim.
     *
     * An UNRESOLVED one means we do not know. A charge may be sitting on
     * that handset right now. Walking the payment back to 'failed' would be
     * two lies at once: it would tell the payer their money is safe, and it
     * would invite them to pay a second time for a debt that may already be
     * settled. So the row is left in flight, with the reason written on it,
     * and the sweep takes it from here: an hour of silence and no reference
     * to ask about puts it in front of a person with the Snippe dashboard
     * open. See `unaskable` in src/lib/payments.ts.
     */
    if (charge.resolved) {
      await markFailed(id, charge.error);
    } else {
      await markUnfulfillable(id, `${charge.error} We are checking whether it went through.`);
    }

    await recordEvent({
      paymentId: id,
      source: 'checkout',
      event: charge.resolved ? 'charge.refused' : 'charge.unresolved',
      status: charge.resolved ? 'failed' : 'unknown',
      amount: payment.amount,
      raw: charge,
    });

    if (!charge.resolved) {
      return json(
        {
          error:
            'We could not confirm that request. Do not pay again — the club is checking and ' +
            'will be in touch today.',
          retryable: false,
        },
        502,
      );
    }

    return json({ error: charge.error, retryable: charge.retryable }, charge.retryable ? 502 : 422);
  }

  // Stored before anything else can happen to it: this reference is the
  // only question the cron sweep can ask Snippe about this payment, and a
  // payer who approves the prompt in four seconds must not beat it here.
  await attachProviderRef(id, charge.reference);

  after(async () => {
    await recordEvent({
      paymentId: id,
      source: 'checkout',
      event: 'charge.sent',
      providerRef: charge.reference,
      status: charge.status,
      amount: payment.amount,
      raw: charge,
    });
  });

  return json({
    ok: true,
    status: 'processing',
    /** What the page says while they look for their phone. */
    message: 'Check your phone and enter your mobile money PIN to approve.',
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
