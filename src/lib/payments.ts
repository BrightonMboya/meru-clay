/**
 * Payments — storage.
 *
 * The same shape as src/lib/bookings.ts and every other storage module here:
 * plain functions over Drizzle, handing back plain objects, so that routes
 * and screens never see a column name.
 *
 * Two things are worth pointing out before reading it.
 *
 * FIRST, nothing in this file decides that money arrived. `markSuccessful`
 * is called only by code that has already asked the payment provider's own
 * API and checked the answer against what was expected. This module writes
 * down conclusions; it does not reach them.
 *
 * The provider is Snippe — see src/lib/snippe.ts, which is the only file
 * that knows so. This one still does not: it records a `provider_ref` and
 * has no opinion about whose it is, which is what let it survive Flutterwave
 * being torn out and will let it survive Snippe.
 *
 * SECOND, `markSuccessful` is written to be safe to call twice, because it
 * will be. A webhook and the cron sweep race on every payment that was slow,
 * and both settle it. The partial unique index on `provider_ref` is the
 * backstop underneath that, and a unique violation is reported rather than
 * thrown — exactly the treatment `createBooking` gives a lost slot.
 */

import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';

import { db } from './db/client';
import {
  paymentEvents,
  payments as paymentsTable,
  type PaymentEventRecord,
  type PaymentRecord,
} from './db/schema';
import {
  type EventSource,
  type PaymentMethod,
  type PaymentPurpose,
  type PaymentStatus,
} from './checkout';
import type { MembershipTier } from './pricing';

/** One payment, as everything above this file thinks of it. */
export type Payment = {
  id: string;
  purpose: PaymentPurpose;
  status: PaymentStatus;
  method: PaymentMethod;
  amount: number;
  currency: string;
  bookingId: string | null;
  playerId: number | null;
  leadId: number | null;
  enrolmentId: number | null;
  tier: MembershipTier | null;
  name: string;
  phone: string;
  email: string;
  attempt: number;
  txRef: string | null;
  checkoutUrl: string | null;
  providerTxId: number | null;
  providerRef: string | null;
  /** Epoch ms, or null. Kept numeric like `DeskBooking` — callers compare clocks. */
  expiresAt: number | null;
  paidAt: number | null;
  fulfilledAt: number | null;
  failureReason: string | null;
  createdAt: number;
};

const ms = (d: Date | null) => (d ? d.getTime() : null);

function toPayment(r: PaymentRecord): Payment {
  return {
    id: r.id,
    purpose: r.purpose,
    status: r.status,
    method: r.method,
    amount: r.amount,
    currency: r.currency,
    bookingId: r.bookingId,
    playerId: r.playerId,
    leadId: r.leadId,
    enrolmentId: r.enrolmentId,
    tier: r.tier,
    name: r.name,
    phone: r.phone,
    email: r.email,
    attempt: r.attempt,
    txRef: r.txRef,
    checkoutUrl: r.checkoutUrl,
    providerTxId: r.providerTxId,
    providerRef: r.providerRef,
    expiresAt: ms(r.expiresAt),
    paidAt: ms(r.paidAt),
    fulfilledAt: ms(r.fulfilledAt),
    failureReason: r.failureReason,
    createdAt: r.createdAt.getTime(),
  };
}

/* ---------------------------------------------------------------- write */

export type NewPaymentInput = {
  purpose: PaymentPurpose;
  amount: number;
  name: string;
  phone: string;
  email: string;
  bookingId?: string;
  playerId?: number;
  leadId?: number;
  enrolmentId?: number;
  tier?: MembershipTier;
  method?: PaymentMethod;
  /** When the link stops working. See `LINK_HOURS`. */
  expiresAt: Date;
};

/**
 * Open a payment.
 *
 * The id is a v4 UUID and is also the link — /pay/<id> — so it is minted
 * here rather than by the database. `payments_target_check` decides whether
 * the combination of purpose and target is legal, which means a malformed
 * payment fails at the insert and never reaches a screen.
 */
export async function createPayment(input: NewPaymentInput): Promise<Payment> {
  const [row] = await db
    .insert(paymentsTable)
    .values({
      id: crypto.randomUUID(),
      purpose: input.purpose,
      amount: input.amount,
      method: input.method ?? 'online',
      name: input.name,
      phone: input.phone,
      email: input.email,
      bookingId: input.bookingId ?? null,
      playerId: input.playerId ?? null,
      leadId: input.leadId ?? null,
      enrolmentId: input.enrolmentId ?? null,
      tier: input.tier ?? null,
      expiresAt: input.expiresAt,
    })
    .returning();

  return toPayment(row);
}

/** Postgres unique-violation. Another writer got to this transaction first. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/**
 * The money is ours.
 *
 * Only ever called once the provider's own API has confirmed the money AND
 * the answer has been checked against what was expected. Idempotent by
 * construction: the `where` clause excludes a payment that is already
 * successful, so the second caller in the redirect/webhook race updates
 * nothing and is told the payment is already settled rather than being
 * treated as an error.
 *
 * A refunded payment is excluded for the same reason and a sharper one: a
 * late delivery about the transaction that was refunded must not put the
 * money back on the books. Money that came in and went back out again is
 * `refunded`, and nothing here is allowed to walk that forwards.
 */
export async function markSuccessful(
  id: string,
  tx: { providerRef: string; providerTxId?: number | null },
): Promise<Payment | null> {
  try {
    const [row] = await db
      .update(paymentsTable)
      .set({
        status: 'successful',
        providerRef: tx.providerRef,
        ...(typeof tx.providerTxId === 'number' ? { providerTxId: tx.providerTxId } : {}),
        paidAt: new Date(),
        failureReason: null,
      })
      .where(
        and(
          eq(paymentsTable.id, id),
          sql`${paymentsTable.status} not in ('successful', 'refunded')`,
        ),
      )
      .returning();

    return row ? toPayment(row) : getPayment(id);
  } catch (err) {
    // `uniq_payment_provider_ref`: this transaction is already recorded
    // against a payment. Two rows claiming one transaction is exactly what
    // that index exists to stop, so the refusal is the correct outcome.
    if (isUniqueViolation(err)) {
      console.error(`payment ${id}: provider ref ${tx.providerRef} is already recorded elsewhere.`);
      return getPayment(id);
    }
    throw err;
  }
}

/**
 * Start an attempt at paying.
 *
 * A compare-and-swap rather than a read followed by a write, because two
 * taps on the pay button half a second apart would otherwise mint two
 * references and push two USSD prompts for one debt. The `where` clause
 * carries the attempt number the caller read, so the second tap updates
 * nothing and is told so.
 *
 * Only a payment that is not already in flight can be started: 'pending' is
 * one nobody has tried yet and 'failed' is one whose last attempt was
 * declined, and both deserve a push. A 'processing' payment has a prompt
 * sitting on somebody's handset and must be left alone until it resolves or
 * the sweep gives up on it.
 *
 * The status moves to 'processing' here, BEFORE the provider is called. If
 * the call then fails the caller walks it back with `markFailed`. That order
 * is deliberate: the failure mode it avoids is a charge that succeeded on a
 * request whose response we lost, against a row that still says 'pending'
 * and invites another.
 */
export async function beginAttempt(
  id: string,
  mintRef: (paymentId: string, attempt: number) => string,
): Promise<{ ok: true; payment: Payment } | { ok: false; reason: string }> {
  const current = await getPayment(id);
  if (!current) return { ok: false, reason: 'No such payment.' };
  if (current.status === 'successful') return { ok: false, reason: 'That is already paid.' };
  if (current.status === 'processing') {
    return { ok: false, reason: 'A payment request is already out. Check your phone.' };
  }
  if (current.status !== 'pending' && current.status !== 'failed') {
    return { ok: false, reason: 'That payment link is closed.' };
  }
  if (current.expiresAt !== null && current.expiresAt < Date.now()) {
    return { ok: false, reason: 'That payment link has expired.' };
  }

  const attempt = current.attempt + 1;

  const [row] = await db
    .update(paymentsTable)
    .set({ status: 'processing', attempt, txRef: mintRef(id, attempt) })
    .where(
      and(
        eq(paymentsTable.id, id),
        eq(paymentsTable.attempt, current.attempt),
        inArray(paymentsTable.status, ['pending', 'failed']),
      ),
    )
    .returning();

  if (!row) return { ok: false, reason: 'A payment request is already out. Check your phone.' };
  return { ok: true, payment: toPayment(row) };
}

/**
 * Remember the provider's own id for this attempt, as soon as it is known.
 *
 * Set separately from `markSuccessful` because it is known earlier — the
 * charge call returns it while the money is still pending — and the sweep
 * needs it to be able to ask about a payment that went quiet. Without it,
 * `stalled` would have a row and no question to ask about it.
 */
export async function attachProviderRef(id: string, providerRef: string): Promise<void> {
  try {
    await db.update(paymentsTable).set({ providerRef }).where(eq(paymentsTable.id, id));
  } catch (err) {
    // `uniq_payment_provider_ref` again. Somebody else's payment already
    // claims this transaction, which is worth shouting about and is not
    // worth failing a charge that has already been made over: the caller is
    // mid-checkout and the reference is also in `payment_events`.
    if (!isUniqueViolation(err)) throw err;
    console.error(`payment ${id}: provider ref ${providerRef} belongs to another payment.`);
  }
}

/** Declined, cancelled or timed out. A failed payment can be tried again. */
export async function markFailed(id: string, reason: string): Promise<Payment | null> {
  const [row] = await db
    .update(paymentsTable)
    .set({ status: 'failed', failureReason: reason })
    // A payment that has already succeeded is never walked back by a late
    // failure notice for an earlier attempt.
    .where(and(eq(paymentsTable.id, id), sql`${paymentsTable.status} <> 'successful'`))
    .returning();

  return row ? toPayment(row) : null;
}

/**
 * The club has done the thing the money was for.
 *
 * Separate from `markSuccessful` on purpose — see the header comment on the
 * table in src/lib/db/schema.ts. Stamping this is the last step of
 * `fulfil`, and until it is stamped the payment sits on the desk's screen.
 */
export async function markFulfilled(id: string): Promise<boolean> {
  const rows = await db
    .update(paymentsTable)
    .set({ fulfilledAt: new Date(), failureReason: null })
    .where(and(eq(paymentsTable.id, id), isNull(paymentsTable.fulfilledAt)))
    .returning({ id: paymentsTable.id });

  return rows.length > 0;
}

/**
 * Write the reason a person is needed onto the payment.
 *
 * The usual case is the one it is named for: paid, and the club could not do
 * the thing — the court went while they were paying for it. The money is not
 * touched and the payment is not failed, because neither would be true.
 *
 * The other two callers have the same shape — real trouble, no automatic
 * answer — and reuse it rather than inventing a second column that means the
 * same thing: a charge whose response was lost (src/app/api/payments/[id]/pay)
 * and the sweep's orphan report. Both leave the status alone on purpose.
 *
 * Whatever sets it, the reason is what the desk reads on Takings, what stops
 * the sweep retrying a fulfilment that cannot work, and what stops the club
 * being told the same thing every fifteen minutes.
 */
export async function markUnfulfillable(id: string, reason: string): Promise<void> {
  await db.update(paymentsTable).set({ failureReason: reason }).where(eq(paymentsTable.id, id));
}

/** Refunded from the provider's dashboard; we hear about it by webhook. */
export async function markRefunded(id: string): Promise<void> {
  await db.update(paymentsTable).set({ status: 'refunded' }).where(eq(paymentsTable.id, id));
}

/**
 * Close a link that should not be used again.
 *
 * For a payment superseded by one for a different amount — see
 * `openPaymentFor` in src/lib/paylink.ts, which is the only caller. Two live
 * links for one debt at two different prices is a way to charge somebody the
 * wrong sum, so the loser is closed rather than left lying about.
 *
 * 'abandoned' rather than 'failed' on purpose: a failed payment invites the
 * payer to try again, which is not the advice here — the replacement link is.
 *
 * Only a payment nothing is happening to can be closed. A 'processing' one
 * has a prompt on somebody's handset that the club cannot un-send, and a
 * successful one is money.
 */
export async function abandonPayment(id: string, reason: string): Promise<boolean> {
  const rows = await db
    .update(paymentsTable)
    .set({ status: 'abandoned', failureReason: reason })
    .where(
      and(eq(paymentsTable.id, id), inArray(paymentsTable.status, ['pending', 'failed'])),
    )
    .returning({ id: paymentsTable.id });

  return rows.length > 0;
}

/**
 * Give up on the payments nobody can ask about.
 *
 * The end of the road for the rows `unaskable` finds: a charge whose HTTP
 * response we lost, so there is no reference to verify and no way for this
 * system to learn what happened. The sweep has already told the club and
 * written the reason on the row; without this they would sit at 'processing'
 * for ever, which is worse than it sounds — `beginAttempt` refuses a
 * processing payment, so the link stays dead and the payer is told a prompt
 * is on its way that never was.
 *
 * Only rows that have been reported are closed, which is what `failure_reason`
 * being set means here. The reason is left in place: closing this is an
 * admission that the club has to settle it by hand, not an answer.
 */
export async function closeUnresolved(before: Date): Promise<number> {
  const rows = await db
    .update(paymentsTable)
    .set({ status: 'abandoned' })
    .where(
      and(
        eq(paymentsTable.status, 'processing'),
        isNull(paymentsTable.providerRef),
        isNotNull(paymentsTable.failureReason),
        lt(paymentsTable.updatedAt, before),
      ),
    )
    .returning({ id: paymentsTable.id });

  return rows.length;
}

/**
 * Write down something the provider said.
 *
 * Never throws and never blocks the caller's own work. A webhook that
 * arrives twice is absorbed by `uniq_payment_event_id` — Snippe retries up
 * to five times with backoff until acknowledged, and stamps every delivery
 * with the same `evt_...` id, so a duplicate is the normal case and not a
 * problem to report.
 *
 * Deliveries that carry no event id (our own fulfilment notes, the desk,
 * the sweep) fall outside that index and are all recorded. That is correct:
 * they are distinct things that happened, not repeats of one.
 */
export async function recordEvent(e: {
  paymentId: string | null;
  source: EventSource;
  event: string;
  /** The provider's id for the delivery itself. The duplicate guard. */
  eventId?: string | null;
  providerRef?: string | null;
  providerTxId?: number | null;
  status?: string | null;
  amount?: number | null;
  raw: unknown;
}): Promise<void> {
  try {
    await db
      .insert(paymentEvents)
      .values({
        paymentId: e.paymentId,
        source: e.source,
        event: e.event,
        eventId: e.eventId ?? null,
        providerRef: e.providerRef ?? null,
        providerTxId: e.providerTxId ?? null,
        status: e.status ?? null,
        amount: e.amount ?? null,
        raw: typeof e.raw === 'string' ? e.raw : JSON.stringify(e.raw),
      })
      .onConflictDoNothing();
  } catch (err) {
    // The audit trail failing must never fail the payment it is about.
    console.error('payment event not recorded:', err);
  }
}

/* ----------------------------------------------------------------- read */

export async function getPayment(id: string): Promise<Payment | null> {
  const [row] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id)).limit(1);
  return row ? toPayment(row) : null;
}

/**
 * A payment by the provider's own reference.
 *
 * The webhook's second way home, for a delivery whose metadata did not
 * survive — Snippe echoes what we sent, but a fallback that costs one index
 * lookup is cheaper than an unmatched payment.
 */
export async function paymentByProviderRef(providerRef: string): Promise<Payment | null> {
  const [row] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.providerRef, providerRef))
    .limit(1);
  return row ? toPayment(row) : null;
}

export async function paymentByTxRef(txRef: string): Promise<Payment | null> {
  const [row] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.txRef, txRef))
    .limit(1);
  return row ? toPayment(row) : null;
}

/**
 * When a link for this payment was last put on somebody's phone.
 *
 * Read from the audit trail rather than from a column of its own, because
 * "we messaged them" is an event and the table for events already exists.
 * `paylink` writes a 'link.sent' note on every delivery; this is what stops
 * the self-serve renewal form being a way to make the club's WhatsApp
 * number send a member a message as often as anybody likes.
 */
export async function lastLinkSentAt(paymentId: string): Promise<number | null> {
  const [row] = await db
    .select({ at: paymentEvents.receivedAt })
    .from(paymentEvents)
    .where(and(eq(paymentEvents.paymentId, paymentId), eq(paymentEvents.event, 'link.sent')))
    .orderBy(desc(paymentEvents.receivedAt))
    .limit(1);

  return row ? row.at.getTime() : null;
}

/**
 * Has this already happened to this payment?
 *
 * For the jobs that must act once and only once. The sweep runs every
 * fifteen minutes over rows that never resolve themselves, so "have we
 * already told the club about this one" has to be answerable — and the
 * timeline is the right place to ask, being the record of what was done
 * rather than a flag that something is wrong.
 */
export async function hasEvent(paymentId: string, event: string): Promise<boolean> {
  const [row] = await db
    .select({ id: paymentEvents.id })
    .from(paymentEvents)
    .where(and(eq(paymentEvents.paymentId, paymentId), eq(paymentEvents.event, event)))
    .limit(1);

  return Boolean(row);
}

/** Everything the provider said about one payment, oldest first. */
export function eventsFor(paymentId: string): Promise<PaymentEventRecord[]> {
  return db
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.paymentId, paymentId))
    .orderBy(asc(paymentEvents.receivedAt));
}

/** The whole ledger over a date range, newest first. The desk's Takings. */
export async function listPayments(from: Date, to: Date): Promise<Payment[]> {
  const rows = await db
    .select()
    .from(paymentsTable)
    .where(and(gte(paymentsTable.createdAt, from), lte(paymentsTable.createdAt, to)))
    .orderBy(desc(paymentsTable.createdAt));

  return rows.map(toPayment);
}

/**
 * Paid and not acted on. The desk's to-do list, and the cron's retry queue.
 *
 * Two quite different things land here: a fulfilment that threw (transient,
 * and retrying fixes it) and one that refused because the court had gone
 * (permanent, and only a person can fix it). They are told apart by
 * `failureReason`, and both have to be seen.
 */
export async function unfulfilled(): Promise<Payment[]> {
  const rows = await db
    .select()
    .from(paymentsTable)
    .where(and(isNotNull(paymentsTable.paidAt), isNull(paymentsTable.fulfilledAt)))
    .orderBy(asc(paymentsTable.paidAt));

  return rows.map(toPayment);
}

/**
 * Payments that went quiet — sent to a checkout, and nothing heard since.
 *
 * The backstop for the case that would otherwise lose somebody's money: a
 * payer who completes a charge and then never reaches us, because the
 * webhook is misconfigured or their phone drops the connection on the way
 * back. Nobody would ever find out.
 *
 * A `provider_ref` is required, because it is the question. Snippe is asked
 * about a transaction by its own reference — `GET /v1/payments/{reference}`
 * — and there is no endpoint that looks one up by the `tx_ref` we minted.
 * `attachProviderRef` stores it the moment the charge call answers, which is
 * well before the money is confirmed, so in practice every payment that got
 * as far as a USSD prompt is in here.
 *
 * The gap that leaves: a charge whose HTTP response we lost entirely, where
 * Snippe made a transaction and we never learned its reference. Those rows
 * sit at 'processing' with a null `provider_ref` and cannot be re-verified
 * by anybody — the cron sweep reports them to the club instead, because a
 * person with the Snippe dashboard open can settle in a minute what this
 * system has no way to ask about.
 */
export async function stalled(before: Date): Promise<Payment[]> {
  const rows = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.status, 'processing'),
        isNotNull(paymentsTable.providerRef),
        lt(paymentsTable.updatedAt, before),
      ),
    )
    .orderBy(asc(paymentsTable.updatedAt));

  return rows.map(toPayment);
}

/**
 * Payments that went quiet and cannot even be asked about — see the gap
 * described on `stalled`. Separated rather than folded in because the two
 * need opposite treatment: one is re-verified automatically, this one needs
 * a person and the club has to be told.
 */
export async function unaskable(before: Date): Promise<Payment[]> {
  const rows = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.status, 'processing'),
        isNull(paymentsTable.providerRef),
        lt(paymentsTable.updatedAt, before),
      ),
    )
    .orderBy(asc(paymentsTable.updatedAt));

  return rows.map(toPayment);
}

/**
 * Close off links nobody used.
 *
 * Only touches payments that never got anywhere — a `processing` row may
 * still have a push notification sitting on somebody's phone, and is left
 * for `stalled` above to re-verify instead.
 */
export async function expireAbandoned(now: Date): Promise<number> {
  const rows = await db
    .update(paymentsTable)
    .set({ status: 'abandoned' })
    .where(
      and(
        eq(paymentsTable.status, 'pending'),
        isNotNull(paymentsTable.expiresAt),
        lt(paymentsTable.expiresAt, now),
      ),
    )
    .returning({ id: paymentsTable.id });

  return rows.length;
}

/** Money actually taken between two moments. Drives the Takings readings. */
export async function takings(from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}), 0)::int` })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.status, 'successful'),
        gte(paymentsTable.paidAt, from),
        lte(paymentsTable.paidAt, to),
      ),
    );

  return row?.total ?? 0;
}

/**
 * Members with a live membership payment already in flight.
 *
 * The reminder job reads this so that somebody who was sent a link on Monday
 * and has not opened it yet is not sent another every day until they do.
 */
export async function playersAwaitingPayment(): Promise<Set<number>> {
  const rows = await db
    .selectDistinct({ playerId: paymentsTable.playerId })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.purpose, 'membership'),
        isNotNull(paymentsTable.playerId),
        or(
          inArray(paymentsTable.status, ['pending', 'processing']),
          // Paid but not yet applied — they have done their part.
          and(isNotNull(paymentsTable.paidAt), isNull(paymentsTable.fulfilledAt)),
        ),
      ),
    );

  return new Set(rows.map((r) => r.playerId).filter((id): id is number => id !== null));
}
