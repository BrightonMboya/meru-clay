/**
 * Turning "the provider says it is paid" into "the club has been paid".
 *
 * Three callers need this and they must not each have their own version of
 * it: the webhook (src/app/api/payments/webhook/route.ts), the cron sweep
 * that catches whatever the webhook missed (src/app/api/cron/payments), and
 * any future desk action that re-checks a payment by hand. A second, subtly
 * different settlement path is how a club ends up double-confirming a court
 * or quietly losing a payment, so there is exactly one and it lives here.
 *
 * ── The rule, in order ───────────────────────────────────────────────────
 *   1. ASK. Never settle on the strength of a webhook body. A signature
 *      proves the delivery came from Snippe; it does not prove the delivery
 *      says what the transaction says, and a replayed or reordered delivery
 *      is a normal occurrence rather than an attack. `verifyPayment` asks
 *      Snippe's own API and the answer is the only thing that counts.
 *
 *   2. CHECK FOUR THINGS. That we know which payment this is, that the
 *      provider says completed, that the currency is TZS, and that the
 *      amount is at least what was asked. Each of these has been a real
 *      incident at some payment provider somewhere; the fourth in
 *      particular is what stops a payer who edits an amount from buying a
 *      year's membership for five hundred shillings.
 *
 *   3. RECORD, THEN FULFIL. `markSuccessful` says the money is ours and
 *      `fulfil` says the club delivered. They are separate and in that
 *      order, so a fulfilment that refuses leaves a payment that is
 *      correctly recorded as paid — see the header of src/lib/fulfil.ts.
 *
 *   4. TELL SOMEBODY when fulfilment refuses. The money is real, the payer
 *      is waiting, and no automatic answer is the right one.
 *
 * Every step is idempotent, because all three callers can and do race.
 */

import 'server-only';

import { fulfil } from './fulfil';
import { notifyEnv, notifyPaymentProblem } from './notify';
import {
  attachProviderRef,
  getPayment,
  markFailed,
  markRefunded,
  markSuccessful,
  markUnfulfillable,
  recordEvent,
  type Payment,
} from './payments';
import { CURRENCY } from './checkout';
import { isCompleted, isDead, isRefunded, verifyPayment } from './snippe';

export type SettleResult =
  /** Money in and the club delivered. */
  | { outcome: 'fulfilled'; payment: Payment }
  /** Money in; somebody else had already done all of this. */
  | { outcome: 'already'; payment: Payment }
  /** Money in, the club cannot deliver, a person has been told. */
  | { outcome: 'blocked'; payment: Payment; reason: string }
  /** Money in twice over. A refund is owed and a person has been told. */
  | { outcome: 'duplicate'; payment: Payment; reason: string }
  /** The money went back out, from the provider's dashboard. */
  | { outcome: 'refunded'; payment: Payment }
  /** The provider says this attempt is over and failed. */
  | { outcome: 'failed'; reason: string }
  /** Still out on somebody's handset. Ask again later. */
  | { outcome: 'pending' }
  /** We could not establish anything. Nothing was written. */
  | { outcome: 'unknown'; reason: string };

/**
 * Real money, and no automatic answer that is safe.
 *
 * A short payment or one in the wrong currency. The money is recorded so it
 * cannot be lost, the club is told once, and the payment is left flagged —
 * paid, unfulfilled, with a reason — which is the state the desk's "Needs
 * attention" list is built on and the state the sweep leaves alone.
 *
 * The order matters: `markSuccessful` clears `failure_reason`, so the flag
 * has to be written after it.
 */
async function flagForAPerson(
  paymentId: string,
  payment: Payment,
  providerRef: string,
  reason: string,
): Promise<SettleResult> {
  // Told once. A webhook Snippe redelivers would otherwise raise the same
  // alarm again, and this is the loudest notification in the app.
  const first = payment.status !== 'successful' || payment.failureReason === null;

  await attachProviderRef(paymentId, providerRef);
  const recorded = await markSuccessful(paymentId, { providerRef });
  await markUnfulfillable(paymentId, reason);

  if (first) {
    await notifyPaymentProblem(notifyEnv(), payment, reason).catch((err) => {
      console.error(`payment ${paymentId}: could not raise the alarm:`, err);
    });
  }

  const after = (await getPayment(paymentId)) ?? recorded ?? payment;
  return { outcome: 'blocked', payment: after, reason };
}

/**
 * Settle one payment against what Snippe actually says about it.
 *
 * `providerRef` is Snippe's own reference for the transaction. The caller
 * supplies it — from the webhook body, or from the ledger row for a payment
 * that went quiet — because there is no way to ask Snippe "what happened to
 * the thing I called mc_xxx": their search takes their reference, not ours.
 *
 * `source` only decides how the audit trail describes this, which matters
 * more than it sounds: "the webhook settled it at 14:02" and "the sweep
 * found it at 14:20" are different stories about the same money, and the
 * desk needs to be able to tell them apart.
 */
export async function settle(
  paymentId: string,
  providerRef: string,
  source: 'webhook' | 'cron' | 'verify' = 'verify',
): Promise<SettleResult> {
  const payment = await getPayment(paymentId);
  if (!payment) return { outcome: 'unknown', reason: 'No such payment.' };

  // Nothing more to do with money that has already gone back out.
  if (payment.status === 'refunded') return { outcome: 'refunded', payment };

  /*
   * Already done, and not worth a round trip to Snippe to re-learn it —
   * but only when this is the same transaction we settled it with.
   *
   * A DIFFERENT reference against a settled payment is the one case that is
   * worth the round trip, and skipping it used to be how a double charge
   * went unnoticed: the webhook for a second, genuinely completed
   * transaction arrived, this line said "already", and nobody ever learned
   * the club had been paid twice. Now it goes and asks.
   */
  if (
    payment.status === 'successful' &&
    payment.fulfilledAt !== null &&
    (payment.providerRef === null || payment.providerRef === providerRef)
  ) {
    return { outcome: 'already', payment };
  }

  const verified = await verifyPayment(providerRef);

  await recordEvent({
    paymentId,
    source,
    event: verified.ok ? `verify.${verified.status}` : 'verify.unreachable',
    providerRef,
    status: verified.ok ? verified.status : null,
    amount: verified.ok ? verified.amount : null,
    raw: verified,
  });

  if (!verified.ok) {
    // Says nothing about whether money moved, so nothing is written to the
    // payment. The sweep will come back to it.
    return { outcome: 'unknown', reason: verified.error };
  }

  if (isRefunded(verified.status)) {
    /*
     * Refunded from Snippe's dashboard. The only way the ledger hears about
     * it, and it has to: money that went back out must stop counting as
     * money that came in. Fulfilment is not undone — a court that was played
     * was played — but the club can see both halves on the timeline.
     *
     * Only when it is the transaction this payment was settled with. A
     * refund of some OTHER attempt says nothing about the money that is
     * actually on the books, and marking the payment refunded on the
     * strength of it would take a real payment off the takings.
     */
    if (payment.providerRef !== null && payment.providerRef !== providerRef) {
      const reason = `${providerRef} was refunded, but this payment was settled with ${payment.providerRef}.`;
      console.error(`payment ${paymentId}: ${reason}`);
      await recordEvent({ paymentId, source, event: 'verify.refund.other', providerRef, raw: reason });
      return { outcome: 'unknown', reason };
    }

    await markRefunded(paymentId);
    return { outcome: 'refunded', payment: (await getPayment(paymentId)) ?? payment };
  }

  if (isDead(verified.status)) {
    // `markFailed` refuses to walk back a payment that already succeeded,
    // so a late 'expired' for attempt 1 cannot undo attempt 2.
    await markFailed(paymentId, failureWords(verified.status));
    return { outcome: 'failed', reason: verified.status };
  }

  if (!isCompleted(verified.status)) {
    return { outcome: 'pending' };
  }

  /* ---- The four checks. Only past all of them is this money ours. ---- */

  /*
   * The two refusals below both mean: real money arrived and the club must
   * not act on it automatically. Neither may leave the row untouched.
   *
   * It used to. The payment stayed at 'processing' with nothing written on
   * it, which had three consequences and all of them bad: `unfulfilled`
   * missed it, so the desk's "Needs attention" list never showed money that
   * had genuinely arrived; `stalled` kept matching it, so the sweep
   * re-verified and re-alarmed every fifteen minutes for ever; and
   * `beginAttempt` refuses a processing payment, so the payer's link was
   * dead with no explanation. So both now record the money (`markSuccessful`)
   * and then flag it for a person (`markUnfulfillable`) — which is exactly
   * the state `fulfil` leaves a court that was resold, and the desk already
   * knows how to read it.
   */

  if (verified.currency !== null && verified.currency !== CURRENCY) {
    const reason = `Snippe reported ${verified.currency}, not ${CURRENCY}. Check before acting.`;
    console.error(`payment ${paymentId}: ${reason}`);
    await recordEvent({ paymentId, source, event: 'verify.rejected', providerRef, raw: reason });
    return flagForAPerson(paymentId, payment, providerRef, reason);
  }

  if (verified.amount !== null && verified.amount < payment.amount) {
    // Short payment. Not a failure — the money is real — but not something
    // that can confirm a court either, so it goes to a person.
    const reason = `Paid ${verified.amount} against ${payment.amount} owed.`;
    console.error(`payment ${paymentId}: ${reason}`);
    await recordEvent({ paymentId, source, event: 'verify.short', providerRef, raw: reason });
    return flagForAPerson(paymentId, payment, providerRef, reason);
  }

  /*
   * A SECOND transaction, verified completed, against a payment that is
   * already settled by a different one. Two references for one debt means
   * the club has been paid twice — the likeliest route being a first attempt
   * that completed late, after the payer had been offered another go — and
   * the difference is owed back.
   *
   * `markSuccessful` would absorb this silently: its guard skips a row that
   * is already successful, so nothing would be written and nothing said. The
   * money would be in the club's account with no record of being owed. So it
   * is caught here, before that guard swallows it.
   */
  if (
    payment.status === 'successful' &&
    payment.providerRef !== null &&
    payment.providerRef !== providerRef
  ) {
    const reason =
      `Paid twice: ${providerRef} arrived on top of ${payment.providerRef}. ` +
      `One payment of ${payment.amount} is owed back.`;
    console.error(`payment ${paymentId}: ${reason}`);
    await recordEvent({ paymentId, source, event: 'verify.duplicate', providerRef, raw: reason });

    // On the row as well as the timeline, so the refund is visible next to
    // the payment on Takings rather than only in a message somebody may
    // have missed — and so a redelivery of this webhook does not raise the
    // alarm a second time.
    const told = payment.failureReason !== null;
    await markUnfulfillable(paymentId, reason);

    if (!told) {
      await notifyPaymentProblem(notifyEnv(), payment, reason).catch((err) => {
        console.error(`payment ${paymentId}: could not raise the alarm:`, err);
      });
    }

    return { outcome: 'duplicate', payment: (await getPayment(paymentId)) ?? payment, reason };
  }

  /* ---- Money in. ---- */

  await attachProviderRef(paymentId, providerRef);
  const settled = await markSuccessful(paymentId, { providerRef });

  if (!settled) return { outcome: 'unknown', reason: 'The payment vanished while settling.' };

  // `payment` is the row as it was BEFORE this settlement, so this is only
  // true the once: a redelivery finds it already successful and says nothing.
  const firstTime = payment.status !== 'successful';

  if (firstTime && verified.amount !== null && verified.amount > payment.amount) {
    /*
     * Overpaid. Fulfilment goes ahead — they have covered what they owed and
     * withholding a court over it would be absurd — but the difference is
     * the club's to give back, and nothing else on the ledger would ever say
     * so. `payments.amount` is left as the price that was quoted: it is what
     * was owed, the receipt depends on it, and the event below is the honest
     * place for what actually arrived.
     */
    const over = verified.amount - payment.amount;
    console.error(`payment ${paymentId}: overpaid by ${over}.`);
    await recordEvent({
      paymentId,
      source,
      event: 'verify.over',
      providerRef,
      status: verified.status,
      amount: verified.amount,
      raw: `Paid ${verified.amount} against ${payment.amount} owed. ${over} is owed back.`,
    });
    await notifyPaymentProblem(
      notifyEnv(),
      payment,
      `Overpaid by ${over}. They paid ${verified.amount} and owed ${payment.amount}.`,
    ).catch(() => {});
  }

  /* ---- The club's half. ---- */

  const done = await fulfil(paymentId);

  if (done.ok) {
    return { outcome: done.outcome === 'already' ? 'already' : 'fulfilled', payment: done.payment };
  }

  if (done.outcome === 'blocked') {
    // The court went while they were paying, or similar. `fulfil` has
    // already written the reason onto the row and the timeline; what is
    // left is to make sure a human hears about it today.
    await notifyPaymentProblem(notifyEnv(), done.payment, done.reason).catch((err) => {
      console.error(`payment ${paymentId}: could not raise the alarm:`, err);
    });
    return { outcome: 'blocked', payment: done.payment, reason: done.reason };
  }

  // 'unpaid' after markSuccessful means something is genuinely wrong.
  console.error(`payment ${paymentId}: settled but fulfilment says ${done.reason}`);
  return { outcome: 'unknown', reason: done.reason };
}

/** Snippe's status word, as the desk and the payer should read it. */
function failureWords(status: string): string {
  switch (status) {
    case 'expired':
      return 'The payment request timed out before it was approved.';
    case 'voided':
      return 'The payment was cancelled.';
    default:
      return 'Mobile money declined the payment.';
  }
}
