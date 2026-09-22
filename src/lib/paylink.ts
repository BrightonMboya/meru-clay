/**
 * Sending somebody a link to pay.
 *
 * Three callers — the desk's renewal button, the desk's joining button, and
 * the self-serve /renew form — and one piece of work: mint a payment, build
 * the /pay/<uuid> URL, and get it onto the member's phone.
 *
 * ── Why a link and not an account ────────────────────────────────────────
 * The club has no member accounts, deliberately, and adding them so that
 * somebody can pay a subscription would be a login screen between the club
 * and its money. So the link IS the credential, exactly as a booking's
 * confirmation URL already is. It is a v4 UUID, it is sent to the number on
 * file and nowhere else, and it expires.
 *
 * ── Why it is one payment per member, not one per reminder ───────────────
 * `openPaymentFor` reuses whatever unexpired payment already exists for that
 * member AT THE SAME PRICE. A club that nudges a lapsed member on Monday,
 * Thursday and the following Tuesday must not thereby create three ways for
 * them to pay the same subscription — and the reminder job in particular
 * would otherwise mint a fresh row every night. A link for a different sum
 * is a different debt, and replaces rather than joins the old one.
 *
 * ── On WhatsApp's 24-hour rule ───────────────────────────────────────────
 * Plain text may only be sent within 24 hours of the recipient last writing
 * to the business number, which a member being chased for a renewal usually
 * has not. So this prefers an approved template when one is configured
 * (WHATSAPP_RENEWAL_TEMPLATE) and falls back to text otherwise, and it
 * reports honestly when neither could go. The URL is always returned, so the
 * desk can read it down the phone when WhatsApp refuses.
 */

import 'server-only';

import { LINK_HOURS, type PaymentPurpose } from './checkout';
import {
  abandonPayment,
  createPayment,
  getPayment,
  lastLinkSentAt,
  recordEvent,
  type Payment,
} from './payments';
import { db } from './db/client';
import { payments as paymentsTable } from './db/schema';
import { and, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { priceClass, priceJoin, priceRenewal, money, type Purchase } from './purchase';
import type { MembershipTier } from './pricing';
import { sendTemplate, sendText } from './whatsapp';

/** The public URL of a payment link. */
export function payUrl(paymentId: string): string {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${origin}/pay/${paymentId}`;
}

/**
 * A payment already open against this thing, if there is one worth reusing.
 *
 * Successful and refunded rows are excluded — those are finished business —
 * but a `failed` one is reused, because a declined card is exactly the case
 * where somebody needs the same link again. Expired links are skipped, so a
 * member chased in March and again in September gets a fresh one.
 *
 * ── It must be the same purchase ──────────────────────────────────────────
 * Reuse used to be decided by the target alone, which quietly lied about
 * money. The desk sending a lead a Monthly link and then a Term one got the
 * Monthly payment back, while the screen and the WhatsApp message quoted
 * Term's price — so the club asked for 240,000, the payer was charged
 * 90,000, and fulfilment gave them a month. The same went for a renewal
 * after somebody's tier changed, or a class whose fee was corrected.
 *
 * So a row is only reused when it is for the same money and the same tier.
 * A mismatched one is closed rather than left open beside its replacement:
 * two live links for one debt at two different prices is the same bug with
 * an extra step. The exception is a payment that is already `processing` —
 * a prompt is out on somebody's handset and the club cannot un-send it, so
 * that one is handed back whatever it says, and every caller quotes the
 * amount on the row rather than the one it just priced.
 */
async function openPaymentFor(
  target: { playerId: number } | { leadId: number } | { enrolmentId: number },
  want: { amount: number; tier?: MembershipTier },
): Promise<Payment | null> {
  const whose =
    'playerId' in target
      ? eq(paymentsTable.playerId, target.playerId)
      : 'leadId' in target
        ? eq(paymentsTable.leadId, target.leadId)
        : eq(paymentsTable.enrolmentId, target.enrolmentId);

  const rows = await db
    .select({
      id: paymentsTable.id,
      amount: paymentsTable.amount,
      tier: paymentsTable.tier,
      status: paymentsTable.status,
    })
    .from(paymentsTable)
    .where(
      and(
        whose,
        inArray(paymentsTable.status, ['pending', 'processing', 'failed']),
        or(isNull(paymentsTable.expiresAt), gt(paymentsTable.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(paymentsTable.createdAt));

  for (const row of rows) {
    const sameMoney = row.amount === want.amount && row.tier === (want.tier ?? null);
    if (sameMoney || row.status === 'processing') return getPayment(row.id);

    await abandonPayment(
      row.id,
      `Replaced by a link for ${money(want.amount)}${want.tier ? ` (${want.tier})` : ''}.`,
    );
  }

  return null;
}

export type LinkResult =
  | {
      ok: true;
      payment: Payment;
      url: string;
      amount: number;
      sent: boolean;
      sendError?: string;
      /** Not sent because one went recently. Not a fault; see `RESEND_MINUTES`. */
      throttled?: boolean;
    }
  | { ok: false; error: string };

/**
 * How long the self-serve form waits before it will message somebody again.
 *
 * /api/renew takes a phone number, is open to the world, and sends a
 * WhatsApp message to the number on file. Without this, anybody who knows a
 * member's number could make the club's business number message them as
 * often as they liked — which costs the club money, annoys the member and
 * puts the number's quality rating at risk. The desk's own buttons are not
 * throttled: an operator pressing send twice means it.
 */
export const RESEND_MINUTES = 60;

/** What a payment can point at. Exactly one, as `payments_target_check` says. */
type Target = { playerId: number } | { leadId: number } | { enrolmentId: number };

/**
 * Mint or reuse the payment, then get the link onto their phone.
 *
 * One path for all three callers. It used to be three near-identical bodies
 * and they had drifted in the way copies do — each quoting `purchase.amount`
 * in the message and the response even when `openPaymentFor` had handed back
 * a payment for a different sum. Everything below the mint quotes the
 * PAYMENT, which is the only number that can actually be charged.
 */
async function link(
  target: Target,
  purpose: PaymentPurpose,
  purchase: Purchase,
  send: boolean,
  throttleMinutes: number,
): Promise<LinkResult> {
  const payment =
    (await openPaymentFor(target, { amount: purchase.amount, tier: purchase.tier })) ??
    (await createPayment({
      purpose,
      playerId: 'playerId' in target ? target.playerId : undefined,
      leadId: 'leadId' in target ? target.leadId : undefined,
      enrolmentId: 'enrolmentId' in target ? target.enrolmentId : undefined,
      tier: purchase.tier,
      amount: purchase.amount,
      name: purchase.customer.name,
      phone: purchase.customer.phone,
      email: purchase.customer.email,
      expiresAt: new Date(Date.now() + LINK_HOURS * 3_600_000),
    }));

  const url = payUrl(payment.id);
  const amount = payment.amount;

  if (!send || !purchase.customer.phone) return { ok: true, payment, url, amount, sent: false };

  if (throttleMinutes > 0) {
    const last = await lastLinkSentAt(payment.id);
    if (last !== null && Date.now() - last < throttleMinutes * 60_000) {
      return {
        ok: true,
        payment,
        url,
        amount,
        sent: false,
        throttled: true,
        sendError: 'A link went to that number recently; not sending another yet.',
      };
    }
  }

  const delivery = await whatsappLink(purchase.customer.phone, {
    name: purchase.customer.name,
    what: purchase.title,
    amount: money(amount),
    url,
  });

  if (delivery.ok) {
    // On the timeline because it belongs there — "we asked them on Tuesday"
    // is part of the story of a payment — and because `lastLinkSentAt` reads
    // it back as the throttle above.
    await recordEvent({
      paymentId: payment.id,
      source: 'checkout',
      event: 'link.sent',
      amount,
      raw: { to: purchase.customer.phone, what: purchase.title },
    });
  }

  return {
    ok: true,
    payment,
    url,
    amount,
    sent: delivery.ok,
    ...(delivery.ok ? {} : { sendError: delivery.error }),
  };
}

/**
 * A renewal link for a member on the roster.
 *
 * `send` is false when the desk only wants the URL to read out or paste
 * somewhere itself. `throttleMinutes` is for the self-serve form — see
 * `RESEND_MINUTES`.
 */
export async function renewalLink(
  playerId: number,
  send = true,
  throttleMinutes = 0,
): Promise<LinkResult> {
  const priced = await priceRenewal(playerId);
  if (!priced.ok) return { ok: false, error: priced.error };

  return link({ playerId }, 'membership', priced.purchase, send, throttleMinutes);
}

/** A joining link for somebody on the leads board who has not joined yet. */
export async function joiningLink(
  leadId: number,
  tier: MembershipTier,
  send = true,
): Promise<LinkResult> {
  const priced = await priceJoin(leadId, tier);
  if (!priced.ok) return { ok: false, error: priced.error };

  return link({ leadId }, 'membership', priced.purchase, send, 0);
}

/**
 * A link to pay for a place in a class.
 *
 * Desk-driven: enrolment happens at the counter (`/api/desk/enrolments`) and
 * there is no public class-booking page, so this is the club asking somebody
 * who is already on the register to settle up. A free session has nothing to
 * pay for and `priceClass` refuses it.
 */
export async function classLink(enrolmentId: number, send = true): Promise<LinkResult> {
  const priced = await priceClass(enrolmentId);
  if (!priced.ok) return { ok: false, error: priced.error };

  return link({ enrolmentId }, 'class', priced.purchase, send, 0);
}

/**
 * Put the link on their phone.
 *
 * The template is tried first because it is the only thing that works out of
 * the blue; plain text is the fallback and is legal only inside the 24-hour
 * window. See the header, and `replyWindow` in src/lib/pipeline.ts.
 *
 * The template must take four body parameters, in this order:
 *   {{1}} name    e.g. "Asha Mollel"
 *   {{2}} what    e.g. "Monthly membership"
 *   {{3}} amount  e.g. "TSh 90,000"
 *   {{4}} link    e.g. "https://meruclay.com/pay/22673b72-…"
 */
async function whatsappLink(
  phone: string,
  f: { name: string; what: string; amount: string; url: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const template = process.env.WHATSAPP_RENEWAL_TEMPLATE;

  const result = template
    ? await sendTemplate(phone, template, [f.name, f.what, f.amount, f.url])
    : await sendText(
        phone,
        [
          `Hi ${f.name},`,
          '',
          `${f.what} — ${f.amount}.`,
          '',
          `Pay here: ${f.url}`,
          '',
          'Any questions, just reply to this message.',
          '— Meru Clay',
        ].join('\n'),
      );

  if (result.ok) return { ok: true };

  console.error(`renewal link to ${phone} not delivered: ${result.error}`);
  return { ok: false, error: result.error };
}
