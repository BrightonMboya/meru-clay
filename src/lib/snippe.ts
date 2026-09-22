/**
 * Snippe — the payment provider, and the only file that knows its name.
 *
 * Flutterwave was here and was removed because it does not serve Tanzania.
 * The lesson of that removal is the shape of this file: everything specific
 * to one provider lives behind these few functions, so the ledger
 * (src/lib/payments.ts), the fulfilment engine (src/lib/fulfil.ts) and the
 * desk's screens never learn who is moving the money. If Snippe goes the way
 * of Flutterwave, this file is what gets rewritten.
 *
 * Snippe is a Tanzanian PSP covering M-Pesa, Airtel Money, Mixx by Yas and
 * Halotel. We use its DIRECT CHARGE flow rather than its hosted checkout:
 * we collect the payer's number on /pay ourselves and ask Snippe to push a
 * USSD prompt to that handset. The payer never leaves Meru Clay, which
 * matters for a club whose members are mostly arriving from a WhatsApp link
 * on a phone with an unreliable connection — a redirect to a third-party
 * page is one more thing that can fail to load.
 *
 * ── There is no sandbox ──────────────────────────────────────────────────
 * Snippe's own documentation is blunt about it: "There is no sandbox
 * environment. Use a small live amount (minimum 500 TZS) to verify the
 * end-to-end flow on a staging site, then enable on production."
 *
 * That is why `SNIPPE_API_URL` exists and is read here rather than being a
 * hard-coded constant. Pointed at the stub in scripts/snippe-stub.mjs, every
 * path in this integration — charging, verifying, settling, fulfilling — can
 * be exercised on a laptop without a shilling moving. Pointed at
 * api.snippe.sh it is the real thing. The code under test is identical, which
 * is the entire point: a test that runs different code proves nothing.
 *
 * ── Money units ──────────────────────────────────────────────────────────
 * Snippe counts in "the smallest currency unit" of TZS, which is the
 * shilling — there is no subdivision anyone uses. So its integers and our
 * `payments.amount` integers are the same number and no conversion happens
 * anywhere in this file. Minimum charge is 500.
 */

import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { CURRENCY } from './checkout';
import { normalisePhone } from './roster';

/**
 * Snippe's own base path is inconsistent in their docs — sessions live under
 * `/api/v1/sessions` while payments live under `/v1/payments`. We only use
 * payments, so only that prefix appears here.
 */
const PAYMENTS = '/v1/payments';

/** The smallest charge Snippe will accept, in shillings. */
export const MIN_CHARGE = 500;

/** How stale a webhook may be before we treat it as a replay. Their number. */
const REPLAY_WINDOW_SECONDS = 300;

function apiBase(): string {
  return (process.env.SNIPPE_API_URL || 'https://api.snippe.sh').replace(/\/+$/, '');
}

/** Whether the club can actually charge anybody right now. */
export function snippeConfigured(): boolean {
  return Boolean(process.env.SNIPPE_API_KEY);
}

/* ------------------------------------------------------------- outbound */

export type ChargeInput = {
  /** Our payment id. Travels in metadata and comes back on the webhook. */
  paymentId: string;
  /** `mc_<id>_<attempt>`, minted by `txRefFor`. The route home. */
  txRef: string;
  attempt: number;
  /** Whole shillings, derived from the ledger row — never from a request. */
  amount: number;
  /** The payer's number in any local spelling; normalised below. */
  phone: string;
  name: string;
  email: string;
  /** What they are buying, for the provider's dashboard. */
  description: string;
};

export type ChargeResult =
  /** The push is out. `reference` is Snippe's id for the transaction. */
  | { ok: true; reference: string; status: string; expiresAt: Date | null }
  /**
   * Refused, with wording already fit to show a payer.
   *
   * `resolved` is the field that matters to the caller, and it answers a
   * question the word "error" hides: do we KNOW no money moved?
   *
   * True for a refusal we can account for — a number that is not Tanzanian,
   * an amount under Snippe's floor, a validation error, a rejected API key.
   * Nothing was charged and the payment can safely be walked back to
   * 'failed' and offered again.
   *
   * False when the request may have been received and we lost the answer: a
   * socket that died mid-flight, a 5xx, a body that would not parse, an
   * otherwise-fine response with no reference in it. A charge may exist. The
   * payer must NOT be invited to pay again, and the payment has to stay in
   * flight so the sweep picks it up — see `unaskable` in src/lib/payments.ts.
   */
  | { ok: false; error: string; retryable: boolean; resolved: boolean };

/**
 * Ask Snippe to push a USSD prompt to the payer's handset.
 *
 * Returns rather than throws for everything a payer can act on — a number
 * on the wrong network, an amount under the floor, a provider having a bad
 * morning — because all of those end up as words on /pay rather than as a
 * stack trace. Only a genuine programming error escapes.
 *
 * ── On idempotency ───────────────────────────────────────────────────────
 * Snippe caps `Idempotency-Key` at 30 characters and answers a longer one
 * with `500 PAY_001`, so our 42-character `tx_ref` cannot be used directly.
 * The key is built from the first eight hex digits of the payment id plus
 * the attempt, which is unique per attempt — the property that matters.
 * Sending the same attempt twice (a retried fetch, a double-submitted form)
 * returns Snippe's cached answer instead of charging twice; starting a
 * genuine second attempt changes the key and is allowed to charge again.
 */
export async function chargeMobileMoney(input: ChargeInput): Promise<ChargeResult> {
  const key = process.env.SNIPPE_API_KEY;
  if (!key) {
    console.error('SNIPPE_API_KEY is unset — cannot charge anybody.');
    return {
      ok: false,
      error: 'Card and mobile money are not set up yet.',
      retryable: false,
      resolved: true,
    };
  }

  const msisdn = toMsisdn(input.phone);
  if (!msisdn) {
    return {
      ok: false,
      error: 'That does not look like a Tanzanian mobile number.',
      retryable: true,
      resolved: true,
    };
  }

  if (input.amount < MIN_CHARGE) {
    // Worth catching here rather than letting Snippe say it: the floor is
    // theirs, but the club's prices are ours, and a class priced below it
    // is a pricing bug rather than something the payer can fix.
    return {
      ok: false,
      error: `Mobile money cannot take less than TSh ${MIN_CHARGE}. Please pay at the court.`,
      retryable: false,
      resolved: true,
    };
  }

  const { firstname, lastname } = splitName(input.name);

  const body = {
    payment_type: 'mobile',
    details: { amount: input.amount, currency: CURRENCY },
    phone_number: msisdn,
    customer: { firstname, lastname, email: input.email },
    webhook_url: webhookUrl(),
    /**
     * The only way home. Snippe mints its own `reference` and has no field
     * for one of ours, but metadata is echoed verbatim on every webhook —
     * so `tx_ref` here is what `paymentIdFrom` reads back out there.
     */
    metadata: {
      tx_ref: input.txRef,
      payment_id: input.paymentId,
      attempt: String(input.attempt),
      what: input.description.slice(0, 200),
    },
  };

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${PAYMENTS}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey(input.paymentId, input.attempt),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch (err) {
    /*
     * A dead socket says nothing about whether Snippe read the request. The
     * request may have been received, the charge made and the response lost
     * on the way back — so this is NOT safe to offer again, and `resolved`
     * says so. The caller leaves the payment in flight for the sweep.
     */
    console.error('snippe: charge request failed to send:', err);
    return {
      ok: false,
      error: 'We could not reach mobile money.',
      retryable: true,
      resolved: false,
    };
  }

  const payload = (await res.json().catch(() => null)) as SnippeEnvelope | null;

  if (!res.ok || !payload?.data) {
    const message = explain(res.status, payload);
    console.error(`snippe: charge refused (${res.status}) for ${input.paymentId}: ${message}`);
    // A 4xx is Snippe telling us it did not act. A 5xx, a 429, or a body
    // that would not parse is Snippe telling us nothing at all.
    const understood = res.status >= 400 && res.status < 500 && res.status !== 429;
    return {
      ok: false,
      error: message,
      retryable: res.status >= 500 || res.status === 429,
      resolved: understood && Boolean(payload),
    };
  }

  const data = payload.data as SnippePayment;
  if (typeof data.reference !== 'string' || !data.reference) {
    // Snippe said yes and did not say what to. Whatever it created, we
    // cannot name it, which is the definition of unresolved.
    console.error(`snippe: charge for ${input.paymentId} came back without a reference.`);
    return {
      ok: false,
      error: 'Mobile money gave us an odd answer.',
      retryable: true,
      resolved: false,
    };
  }

  return {
    ok: true,
    reference: data.reference,
    status: typeof data.status === 'string' ? data.status : 'pending',
    expiresAt: data.expires_at ? new Date(data.expires_at) : null,
  };
}

export type VerifyResult =
  /** Snippe answered about this transaction. `status` is theirs, verbatim. */
  | { ok: true; status: string; amount: number | null; currency: string | null }
  /** We could not get an answer. Says nothing about whether money moved. */
  | { ok: false; error: string };

/**
 * Ask Snippe what really happened to a transaction.
 *
 * This is the "verify, do not believe" step, and it is the reason a forged
 * webhook cannot confirm a court. A delivery to our webhook is only ever a
 * nudge to come and ask; this is the asking, and the answer is the only
 * thing `markSuccessful` is ever called on.
 *
 * Also the cron sweep's tool for the payer who paid and never came back —
 * see `stalled` in src/lib/payments.ts.
 */
export async function verifyPayment(reference: string): Promise<VerifyResult> {
  const key = process.env.SNIPPE_API_KEY;
  if (!key) return { ok: false, error: 'SNIPPE_API_KEY is unset.' };

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${PAYMENTS}/${encodeURIComponent(reference)}`, {
      headers: { authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
  } catch (err) {
    console.error(`snippe: could not reach verify for ${reference}:`, err);
    return { ok: false, error: 'Could not reach the provider.' };
  }

  const payload = (await res.json().catch(() => null)) as SnippeEnvelope | null;

  if (!res.ok || !payload?.data) {
    return { ok: false, error: explain(res.status, payload) };
  }

  const data = payload.data as SnippePayment;
  return {
    ok: true,
    status: typeof data.status === 'string' ? data.status : 'unknown',
    amount: typeof data.amount?.value === 'number' ? data.amount.value : null,
    currency: typeof data.amount?.currency === 'string' ? data.amount.currency : null,
  };
}

/* -------------------------------------------------------------- inbound */

/**
 * Prove a webhook POST came from Snippe.
 *
 * Their scheme: HMAC-SHA256 over `{timestamp}.{raw body}`, hex-encoded, in
 * `X-Webhook-Signature`, with the timestamp beside it in
 * `X-Webhook-Timestamp`. The signing key is per-account, from Settings →
 * Webhook Secret in their dashboard.
 *
 * Two things this deliberately does NOT do.
 *
 * It does not accept an unsigned delivery, in any environment — unlike
 * `verifySignature` in src/lib/whatsapp.ts, which lets one through on a
 * laptop. The difference is what the endpoint can do: the WhatsApp webhook
 * writes a message into a board, this one confirms courts and clears debts.
 * The local stub signs its deliveries properly (scripts/snippe-replay.mjs),
 * so nothing is lost by refusing.
 *
 * And it does not re-serialise the body. The signature is over the exact
 * bytes Snippe sent; `JSON.parse` followed by `JSON.stringify` reorders keys
 * and drops whitespace, and the comparison then fails for a genuine
 * delivery. The raw string is threaded all the way through from the route.
 */
export function verifyWebhook(
  raw: string,
  signature: string | null,
  timestamp: string | null,
): { ok: true } | { ok: false; why: string } {
  const secret = process.env.SNIPPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SNIPPE_WEBHOOK_SECRET is unset — refusing an unverifiable payment webhook.');
    return { ok: false, why: 'no signing key configured' };
  }

  if (!signature || !timestamp) return { ok: false, why: 'unsigned' };

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, why: 'unreadable timestamp' };

  // Replay protection. A signature stays valid forever, so a delivery
  // captured off the wire could otherwise be posted back at us next year to
  // re-confirm a court. Snippe retries for at most 24 minutes; five minutes
  // is their recommended window and is comfortably inside their backoff.
  const age = Math.floor(Date.now() / 1000) - sent;
  if (Math.abs(age) > REPLAY_WINDOW_SECONDS) return { ok: false, why: `stale by ${age}s` };

  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`, 'utf8').digest();

  let given: Buffer;
  try {
    given = Buffer.from(signature, 'hex');
  } catch {
    return { ok: false, why: 'malformed signature' };
  }

  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, why: 'signature mismatch' };
  }

  return { ok: true };
}

/** What Snippe is telling us, in the few fields this system acts on. */
export type SnippeEvent = {
  /** `evt_...`. Unique per delivery; our duplicate-webhook guard. */
  eventId: string | null;
  /** `payment.completed`, `payment.failed`, `payment.voided`, ... */
  type: string;
  /** Snippe's id for the transaction. What `verifyPayment` is called with. */
  reference: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  /** Our `mc_<id>_<attempt>`, echoed back out of the metadata we sent. */
  txRef: string | null;
};

/**
 * Pull the event apart.
 *
 * Written against the 2026-01-25 envelope — `{ id, type, data: { ... } }` —
 * but tolerant of the legacy flat shape, because an account can be pinned to
 * the older API version and the difference is not worth a second code path.
 * In the new shape `data.amount` is an object; when creating a payment it is
 * a plain integer. That asymmetry is theirs, and it is the single easiest
 * thing to get wrong here.
 */
export function readEvent(body: Record<string, unknown>): SnippeEvent {
  const data = (isObject(body.data) ? body.data : body) as Record<string, unknown>;
  const amount = isObject(data.amount) ? data.amount : null;
  const metadata = isObject(data.metadata) ? data.metadata : {};

  return {
    eventId: str(body.id),
    type: str(body.type) ?? str(body.event) ?? 'unknown',
    reference: str(data.reference),
    status: str(data.status),
    // New shape: `{ value, currency }`. Legacy flat shape: the same object.
    amount: amount && typeof amount.value === 'number' ? amount.value : num(data.amount),
    currency: amount ? str(amount.currency) : null,
    txRef: str(metadata.tx_ref),
  };
}

/** Did this event say the money arrived? Their spelling, not ours. */
export function isCompleted(status: string | null): boolean {
  return status === 'completed';
}

/** Did it say the attempt is over and unsuccessful? */
export function isDead(status: string | null): boolean {
  return status === 'failed' || status === 'voided' || status === 'expired';
}

/**
 * Did it say the money went back?
 *
 * A refund is made from Snippe's dashboard rather than from here — the club
 * refunds by hand, having decided to — so this is the only way the ledger
 * finds out about one. It has to be told: a refunded payment that still
 * reads as 'successful' is money on the Takings screen that is not in the
 * club's account. 'reversed' is the same event by their other name.
 */
export function isRefunded(status: string | null): boolean {
  return status === 'refunded' || status === 'reversed';
}

/* --------------------------------------------------------------- shapes */

type SnippeEnvelope = {
  status?: string;
  code?: number;
  error_code?: string;
  message?: string;
  data?: unknown;
};

type SnippePayment = {
  reference?: unknown;
  status?: unknown;
  expires_at?: string;
  amount?: { value?: unknown; currency?: unknown };
};

/* -------------------------------------------------------------- helpers */

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * Snippe wants `255XXXXXXXXX` — no plus, no spaces.
 *
 * `normalisePhone` already holds the club's rule for what a Tanzanian mobile
 * number is and is reused rather than re-implemented, so a number the roster
 * accepts is a number we can charge. It returns '' for "no number on file",
 * which is legitimate on a player row and useless here.
 */
export function toMsisdn(raw: string): string | null {
  const normalised = normalisePhone(raw ?? '');
  if (!normalised) return null;
  return normalised.replace(/^\+/, '');
}

/**
 * Snippe requires a first and last name and the club frequently has one
 * word. Splitting on the last space and repeating the single word rather
 * than sending an empty string, which their validator rejects.
 */
function splitName(name: string): { firstname: string; lastname: string } {
  const parts = (name || 'Meru Clay').trim().split(/\s+/);
  if (parts.length === 1) return { firstname: parts[0], lastname: parts[0] };
  return { firstname: parts.slice(0, -1).join(' '), lastname: parts[parts.length - 1] };
}

/** Max 30 characters, unique per attempt. See the note on `chargeMobileMoney`. */
function idempotencyKey(paymentId: string, attempt: number): string {
  return `mc-${paymentId.replace(/-/g, '').slice(0, 12)}-${attempt}`;
}

/**
 * Where Snippe posts back to.
 *
 * Sent on every charge rather than registered once in their dashboard, which
 * is what lets a staging deployment and production coexist on one account
 * without either stealing the other's callbacks.
 */
function webhookUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  return `${base}/api/payments/webhook`;
}

/** A refusal, in words fit for somebody standing at a court. */
function explain(status: number, payload: SnippeEnvelope | null): string {
  const raw = payload?.message ?? '';

  switch (status) {
    case 400:
    case 422:
      // Their validation messages are terse but accurate ("amount is
      // required"), and a payer seeing one is better than a blank apology.
      return raw || 'Mobile money would not accept those details.';
    case 401:
    case 403:
      // Never the payer's problem, and never the payer's business.
      console.error(`snippe: rejected our API key (${status}) — ${raw}`);
      return 'Mobile money is not set up correctly. Please pay at the court.';
    case 429:
      return 'Mobile money is busy. Wait a moment and try again.';
    default:
      return raw || 'Mobile money is not answering. Try again in a minute.';
  }
}
