import { isLive } from '@/lib/checkout';
import { getPayment, type Payment } from '@/lib/payments';
import { describePayment } from '@/lib/purchase';
import { refreshAttempt } from '@/lib/settle';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payments/:id — a payer's view of their own payment.
 *
 * The id is a v4 UUID that appears only in the link they were sent, so
 * holding it is the authorisation — the same arrangement `/api/bookings/[id]`
 * documents at length.
 *
 * What is deliberately NOT here: the provider's transaction id, the raw
 * provider payloads, the internal failure reason when fulfilment is blocked.
 * A payer needs to know whether their money arrived and what to do next; the
 * reference a refund would be chased with belongs to the desk, on Takings.
 *
 * The /pay page polls this while a mobile-money push is out, which is why it
 * is a small JSON route rather than a server render.
 */
export async function GET(_request: Request, ctx: RouteContext<'/api/payments/[id]'>) {
  const { id } = await ctx.params;

  try {
    const found = await getPayment(id);
    if (!found) return json({ error: 'No such payment.' }, 404);
    const payment = await askProvider(found);

    const { title, detail } = await describePayment(payment);

    return json({
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      purpose: payment.purpose,
      title,
      detail,
      name: payment.name,
      /**
       * The number the club holds for them, to save typing it on a phone.
       * Their own, behind a link only they were sent, and alongside their
       * own name — so no more exposed than the rest of this response.
       */
      phone: payment.phone,
      /** Money in AND the club has delivered. The only fully finished state. */
      done: payment.status === 'successful' && payment.fulfilledAt !== null,
      /**
       * Paid, but the club could not deliver — almost always a court that
       * went while they were paying. The page says a person will be in
       * touch; it does not try to explain the machinery.
       */
      needsClub: payment.status === 'successful' && payment.fulfilledAt === null,
      /**
       * In flight, but not because a prompt is on its way: we asked the
       * provider to charge them and never got an answer, so nobody here
       * knows whether money moved. The page has to say something other than
       * "check your phone", and it must not offer to try again. The reason
       * itself stays on the desk's screen — a payer does not need our
       * plumbing, only to know a person is on it.
       *
       * All three conditions are load-bearing. No provider reference means
       * we never learned what to ask about; a reason means somebody has
       * written down what went wrong. A charge that is simply in progress
       * has neither, so this cannot flash up between sending a prompt and
       * hearing back about it.
       */
      checking:
        payment.status === 'processing' &&
        payment.providerRef === null &&
        payment.failureReason !== null,
      /** Worth waiting on, so the page keeps polling. */
      pending: isLive(payment.status),
      reference: payment.id.slice(0, 8),
      /** Where to go back to, once there is nothing left to pay. */
      bookingId: payment.bookingId,
    });
  } catch (err) {
    console.error('payment lookup failed:', err);
    return json({ error: 'Could not load that payment.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** When each payment was last asked about, so a poll every 4s is not a verify every 4s. */
const asked = new Map<string, number>();
const ASK_EVERY_MS = 8_000;

/**
 * While a prompt is out, go and ask Snippe rather than only waiting to be told.
 *
 * The webhook is how a payment normally lands, and the sweep catches what it
 * misses — but the sweep runs every fifteen minutes at best, and a webhook
 * can be late, refused or misconfigured. The payer is staring at this page
 * with their phone in hand, so while they are, their own poll does the
 * asking, through `refreshAttempt`: only an answer that ends the attempt is
 * handed to `settle`, and a still-pending answer writes nothing, so a minute
 * of polling does not fill the timeline with "still pending". The same call
 * releases an attempt Snippe has outlived, so an old link reopened next
 * week offers the Pay button rather than "check your phone".
 *
 * Never throws: the page must still render what the ledger says.
 */
async function askProvider(payment: Payment): Promise<Payment> {
  if (payment.status !== 'processing' || !payment.providerRef) return payment;

  const last = asked.get(payment.id) ?? 0;
  if (Date.now() - last < ASK_EVERY_MS) return payment;
  asked.set(payment.id, Date.now());

  const now = await refreshAttempt(payment);
  if (now.status !== 'processing') asked.delete(payment.id);
  return now;
}
