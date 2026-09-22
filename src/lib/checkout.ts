/**
 * The club's money, as vocabulary.
 *
 * The same split every other domain here uses — src/lib/roster.ts holds the
 * words and src/lib/players.ts holds the rows; src/lib/pipeline.ts holds the
 * words and src/lib/leads.ts holds the rows. This file is the words. Nothing
 * in it touches the database or the network, which is what lets the schema,
 * the routes, the screens and any provider adapter all agree on the same
 * spellings without any of them importing each other.
 *
 * `src/lib/pricing.ts` is next door and is a different question: that one
 * says what things cost, this one says what a payment *is*.
 *
 * ── On the shape of a payment ────────────────────────────────────────────
 * One row per thing being bought, not one row per attempt at buying it. A
 * player whose card is declined and who then pays with mobile money has made
 * one payment, of which the first try failed, and the link the club sent them
 * has to keep working across both. So the row carries an `attempt` counter and
 * every attempt gets its own `tx_ref` (see `txRefFor`), while the row's id —
 * the thing in the URL — never changes.
 *
 * Every word the payment provider says back is kept separately, in
 * `payment_events`. That is the audit trail, and it is the reason a disputed
 * payment is a question the club can actually answer.
 *
 * ── The provider is behind one module ────────────────────────────────────
 * Snippe, and src/lib/snippe.ts is the only file that knows so. Flutterwave
 * was here before it and was removed — it does not serve Tanzania — and
 * nothing in this file, the ledger, or `fulfil` depended on it. That was the
 * point of keeping the provider behind one module, and it is why the words
 * here name none of them.
 */

/** What a payment is for. Decides what fulfilling it does. */
export const PAYMENT_PURPOSES = ['booking', 'membership', 'class'] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

/**
 * Where a payment has got to.
 *
 *   pending     — the row exists, nobody has been sent anywhere yet
 *   processing  — they are at the checkout, or a mobile-money push is out
 *   successful  — the money is ours, confirmed against the provider's own API
 *   failed      — declined, cancelled, timed out at their end
 *   abandoned   — the link expired with nothing having happened
 *   refunded    — given back, from the provider's dashboard
 *
 * `successful` says the money arrived. It does NOT say the court was booked
 * or the membership extended — that is `fulfilled_at`, and the two are
 * deliberately separate columns. See the note on `fulfil`.
 */
export const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'successful',
  'failed',
  'abandoned',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * How the money came in.
 *
 * 'online' covers whatever payment provider the club is on — the ledger does
 * not care which, and naming one here is how a table ends up carrying the
 * name of a provider it has outlived. 'cash' is what the desk takes at the
 * court, which is still most of the club's money.
 */
export const PAYMENT_METHODS = ['online', 'cash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Where an event came from, for the audit trail. */
export const EVENT_SOURCES = ['checkout', 'webhook', 'verify', 'cron'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/** The only currency the club charges in. Tanzanian shillings, whole ones. */
export const CURRENCY = 'TZS';

/**
 * How long a link the club sends somebody stays alive.
 *
 * Generous on purpose: a link goes out by WhatsApp and is read when the
 * member next picks up their phone, which may be tomorrow.
 */
export const LINK_HOURS = 72;

export function isPurpose(v: unknown): v is PaymentPurpose {
  return typeof v === 'string' && (PAYMENT_PURPOSES as readonly string[]).includes(v);
}

export function isPaymentStatus(v: unknown): v is PaymentStatus {
  return typeof v === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(v);
}

/** Still worth waiting on. A pending or processing payment may yet land. */
export function isLive(status: PaymentStatus): boolean {
  return status === 'pending' || status === 'processing';
}

/** Nothing more will happen to this one on its own. */
export function isSettled(status: PaymentStatus): boolean {
  return !isLive(status);
}

/**
 * The reference a provider echoes back to us, unique per attempt.
 *
 * Prefixed so that a glance at any provider's dashboard says which system a
 * transaction belongs to, and suffixed with the attempt so a retry cannot
 * collide with the try before it — providers generally reject a duplicate
 * reference, which is a protection worth keeping rather than working around.
 */
export function txRefFor(paymentId: string, attempt: number): string {
  return `mc_${paymentId}_${attempt}`;
}

/** The payment id back out of a `tx_ref`, or null if it is not one of ours. */
export function paymentIdFrom(txRef: string): string | null {
  const m = /^mc_([0-9a-f-]{36})_\d+$/i.exec(txRef);
  return m ? m[1] : null;
}

/** How a purpose reads on the desk's screens. */
export const PURPOSE_LABEL: Record<PaymentPurpose, string> = {
  booking: 'Court',
  membership: 'Membership',
  class: 'Class',
};

/** How a status reads on the desk's screens. */
export const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Not started',
  processing: 'In progress',
  successful: 'Paid',
  failed: 'Failed',
  abandoned: 'Abandoned',
  refunded: 'Refunded',
};
