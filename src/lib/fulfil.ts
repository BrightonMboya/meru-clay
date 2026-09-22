/**
 * Doing the thing the money was for.
 *
 * `markSuccessful` in src/lib/payments.ts says the money arrived. This says
 * the club delivered: the court is confirmed, the membership is extended,
 * the new member is on the roster, the class place is settled. They are two
 * steps rather than one because they can genuinely come apart, and the whole
 * design of this file follows from the case where they do.
 *
 * ── Why fulfilment can fail ──────────────────────────────────────────────
 * A court is held for ten minutes (`HOLD_MINUTES`). A payment for one can
 * arrive after that — settled late, recorded by the desk the next morning,
 * or recovered by the sweep — and by then another player may have taken an
 * overlapping slot. Then the money is real, the court is gone, and no
 * automatic answer is the right one: a refund and another slot are both
 * reasonable and only the club can choose. So fulfilment refuses, says why,
 * and the payment surfaces on the desk's Takings screen under "Needs
 * attention" with the club messaged.
 *
 * It must never silently swallow the money and it must never double-book.
 *
 * ── Why it is safe to call repeatedly ────────────────────────────────────
 * It is called from every path that can settle a payment — a provider's
 * webhook, a desk action, the cron sweep that catches whatever those missed
 * — and several of them can race on one payment. So:
 *
 *   - Everything happens inside one transaction holding a transaction-scoped
 *     advisory lock on the payment id, which is the same device
 *     `createBooking` uses to serialise writers on a court-day.
 *   - The first thing inside the lock is a re-read. A payment already
 *     stamped `fulfilled_at` returns `already` and touches nothing.
 *   - The effect and the stamp commit together. There is no window in which
 *     a court is confirmed but the payment does not know it.
 *
 * Advisory locks are transaction-scoped deliberately: they are released by
 * the commit, which is what makes them safe behind Supabase's
 * transaction-mode pooler. See the header of src/lib/bookings.ts.
 */

import { eq, sql } from 'drizzle-orm';

import { confirmBooking, markPaid, overlappedByOthers } from './bookings';
import { db } from './db/client';
import { bookings as bookingsTable, leads as leadsTable, payments as paymentsTable } from './db/schema';
import { getEnrolment, markEnrolmentPaid } from './enrolments';
import { createPlayer, markMembershipPaid } from './players';
import { getPayment, markUnfulfillable, recordEvent, type Payment } from './payments';
import { MEMBERSHIP_TIERS, type MembershipTier } from './pricing';
import { addMonths, nowLocal } from './time';

/** A Drizzle transaction handle, as `db.transaction` hands one out. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** What the transaction concluded, before the committed row is re-read. */
type TxOutcome =
  | { kind: 'unpaid'; reason: string }
  | { kind: 'already' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'fulfilled' };

export type FulfilResult =
  /** Done, just now. The caller should tell somebody. */
  | { ok: true; outcome: 'fulfilled'; payment: Payment }
  /** Done previously. The other half of the race got here first. */
  | { ok: true; outcome: 'already'; payment: Payment }
  /** Not paid for yet. Nothing to do and nothing wrong. */
  | { ok: false; outcome: 'unpaid'; reason: string }
  /** Paid, and the club cannot deliver. A person has to look at this. */
  | { ok: false; outcome: 'blocked'; reason: string; payment: Payment };

/**
 * Apply a payment's effect, exactly once.
 *
 * Returns rather than throws for every outcome a caller can do something
 * about; a genuine database failure still throws, because the cron sweep
 * retrying it later is the right answer and pretending otherwise would bury
 * the fault.
 */
export async function fulfil(paymentId: string): Promise<FulfilResult> {
  const today = nowLocal();

  const outcome = await db.transaction(async (tx): Promise<TxOutcome> => {
    // One fulfiller at a time for this payment. Released at commit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pay:${paymentId}`})::bigint)`);

    const [row] = await tx
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, paymentId))
      .limit(1);

    if (!row) return { kind: 'unpaid', reason: 'No such payment.' };
    if (!row.paidAt) return { kind: 'unpaid', reason: 'That payment has not been settled.' };
    if (row.fulfilledAt) return { kind: 'already' };

    const applied = await apply(tx, row, today.date, today.epochMs);
    if (!applied.ok) return { kind: 'blocked', reason: applied.reason };

    await tx
      .update(paymentsTable)
      .set({ fulfilledAt: new Date(), failureReason: null })
      .where(eq(paymentsTable.id, paymentId));

    return { kind: 'fulfilled' };
  });

  if (outcome.kind === 'unpaid') {
    return { ok: false, outcome: 'unpaid', reason: outcome.reason };
  }

  // Re-read outside the transaction so callers get the committed row.
  const payment = await getPayment(paymentId);
  if (!payment) return { ok: false, outcome: 'unpaid', reason: 'No such payment.' };

  // An 'already' is not recorded. It happens on nearly every payment — the
  // webhook and the browser both arrive and one of them loses — and writing
  // it down would bury the timeline in noise about a race that is working.
  if (outcome.kind === 'already') return { ok: true, outcome: 'already', payment };

  if (outcome.kind === 'blocked') {
    // Written outside the transaction that refused, so the reason survives
    // the rollback of whatever it was refusing.
    await markUnfulfillable(paymentId, outcome.reason);
    await note(payment, 'fulfilment.blocked', outcome.reason);
    return { ok: false, outcome: 'blocked', reason: outcome.reason, payment };
  }

  await note(payment, 'fulfilment.done', null);
  return { ok: true, outcome: 'fulfilled', payment };
}

/**
 * Put the outcome on the payment's timeline.
 *
 * `failure_reason` on the row already says what went wrong, but it says only
 * the latest thing and it says nothing about when. The question this table
 * exists to answer — "I paid on Saturday and it is not showing" — needs the
 * order of events, and fulfilment is the step at which that conversation
 * usually starts. Never blocks: `recordEvent` swallows its own failures.
 */
function note(payment: Payment, event: string, reason: string | null): Promise<void> {
  return recordEvent({
    paymentId: payment.id,
    source: 'verify',
    event,
    providerTxId: payment.providerTxId,
    status: reason ? 'blocked' : 'fulfilled',
    amount: payment.amount,
    raw: { reason, purpose: payment.purpose },
  });
}

type Applied = { ok: true } | { ok: false; reason: string };

/** Dispatch on what was bought. Runs inside the caller's transaction. */
function apply(
  tx: Tx,
  row: typeof paymentsTable.$inferSelect,
  today: string,
  epochMs: number,
): Promise<Applied> {
  switch (row.purpose) {
    case 'booking':
      return applyBooking(tx, row.bookingId!, epochMs);
    case 'membership':
      return row.playerId !== null
        ? applyRenewal(tx, row.playerId, row.tier, today)
        : applyJoin(tx, row.leadId!, row.tier ?? 'monthly', row.name, row.phone, row.email, today);
    case 'class':
      return applyClass(tx, row.enrolmentId!);
  }
}

/**
 * A court, paid for online.
 *
 * Confirming is what payment buys — the coach no longer has to promote the
 * hold by hand for anybody who has paid. The check before it is the one
 * described in the header: the slot may have been resold while they were
 * paying, and the court-day advisory lock makes the answer trustworthy by
 * serialising this against `createBooking`.
 */
async function applyBooking(
  tx: Tx,
  bookingId: string,
  epochMs: number,
): Promise<Applied> {
  const [b] = await tx
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId))
    .limit(1);

  if (!b) return { ok: false, reason: 'The booking this paid for no longer exists.' };

  if (b.status === 'cancelled') {
    return { ok: false, reason: 'The booking was cancelled before the payment arrived.' };
  }

  // Same key `createBooking` locks on, so the two cannot interleave.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${b.courtId}:${b.date}`})::bigint)`,
  );

  const taken = await overlappedByOthers(
    {
      id: b.id,
      court_id: b.courtId,
      date: b.date,
      start_min: b.startMin,
      end_min: b.endMin,
    },
    epochMs,
    tx,
  );

  if (taken) {
    return {
      ok: false,
      reason: 'The hold lapsed and the court was taken before the payment came through.',
    };
  }

  // An already-confirmed booking is fine — the desk may have confirmed it
  // while the player was paying. Only the payment half is still outstanding.
  if (b.status === 'held') await confirmBooking(bookingId, tx);
  await markPaid(bookingId, true, tx);

  return { ok: true };
}

/**
 * A membership renewed.
 *
 * `markMembershipPaid` already holds the rule that matters — a term runs
 * from whichever is later, today or the day the current one ends — so
 * paying a fortnight early adds a month rather than losing a fortnight. It
 * is not reimplemented here; it is called.
 *
 * What IS decided here is which term was bought: `payments.tier`, the tier
 * the link was priced at, rather than whatever the roster row says today.
 * They come apart whenever somebody's membership is changed at the desk
 * between the link going out and the money arriving, and the term has to
 * follow the money. A tier with no term cannot be renewed — that is a
 * payment that should never have been minted, and stamping it fulfilled
 * having given nothing would bury it.
 */
async function applyRenewal(
  tx: Tx,
  playerId: number,
  tier: MembershipTier | null,
  today: string,
): Promise<Applied> {
  if (tier !== null && MEMBERSHIP_TIERS[tier].months === 0) {
    return { ok: false, reason: `${MEMBERSHIP_TIERS[tier].label} has no term to extend.` };
  }

  const updated = await markMembershipPaid(playerId, today, { tx, tier: tier ?? undefined });
  if (!updated) return { ok: false, reason: 'That member is no longer on the roster.' };

  // `markMembershipPaid` returns the row untouched for a tier with no term,
  // which is the roster row disagreeing with what was paid for. Refusing is
  // the only honest answer: the money is real and a person has to decide.
  if (tier === null && MEMBERSHIP_TIERS[updated.membership].months === 0) {
    return { ok: false, reason: 'That member is on a tier with no term to extend.' };
  }

  return { ok: true };
}

/**
 * Somebody joining, and paying on the way in.
 *
 * The lead becomes a player and the two rows are stitched together, which is
 * exactly what the desk does by hand when an enquiry turns into a member —
 * the lead keeps the story of how they arrived. See the note on `leads` in
 * src/lib/db/schema.ts.
 *
 * `createPlayer` returns null when that number is already a live member, and
 * that is not an error: somebody who was added at the desk this morning and
 * then paid online this afternoon is one member who has paid. The payment is
 * fulfilled either way, and the roster is left as it is rather than being
 * argued with.
 */
async function applyJoin(
  tx: Tx,
  leadId: number,
  tier: MembershipTier,
  name: string,
  phone: string,
  email: string,
  today: string,
): Promise<Applied> {
  const { months } = MEMBERSHIP_TIERS[tier];
  const paidUntil = months > 0 ? addMonths(today, months) : null;

  const player = await createPlayer(
    { name, phone, email, membership: tier, paidUntil, joinedOn: today },
    today,
    tx,
  );

  await tx
    .update(leadsTable)
    .set({
      stage: 'joined',
      ...(player ? { playerId: player.id } : {}),
      updatedAt: new Date(),
    })
    .where(eq(leadsTable.id, leadId));

  return { ok: true };
}

/**
 * A place in a class, settled.
 *
 * The already-paid check is not redundant with `priceClass`, which only sees
 * the world at the moment a link is minted. The link lives for three days,
 * and in that time the same player can walk up to the counter and pay cash
 * for the same place. `markEnrolmentPaid` would happily set a true column
 * true again and report success, so the second payment would fulfil
 * silently. It is somebody's money twice over, and only a person can settle
 * that — the same argument as a court that was resold.
 */
async function applyClass(
  tx: Tx,
  enrolmentId: number,
): Promise<Applied> {
  const enrolment = await getEnrolment(enrolmentId, tx);
  if (!enrolment) return { ok: false, reason: 'That class place no longer exists.' };

  if (enrolment.paid) {
    return { ok: false, reason: 'That class place was already paid for. A refund may be owed.' };
  }

  const done = await markEnrolmentPaid(enrolmentId, tx);
  if (!done) return { ok: false, reason: 'The class place was cancelled before payment arrived.' };

  return { ok: true };
}
