/**
 * What is being bought, resolved from the thing it points at.
 *
 * Two directions, one file, because they have to agree. Going forwards, the
 * checkout route asks "somebody wants to pay for booking X — what does that
 * cost and who are they?" Going backwards, the /pay page asks "this payment
 * exists — what is it for?" A club that quoted one price on the checkout
 * page and charged another would be a bug nobody forgives, so both questions
 * are answered from the same place.
 *
 * ── The rule this file exists to enforce ─────────────────────────────────
 * The amount is derived here, from src/lib/pricing.ts and the row in the
 * database, and it is never read from the request body. A client that posts
 * `{ bookingId, amount: 1 }` gets charged what the booking costs. This is
 * the only place the number comes from.
 *
 * `bookings.amount` was written by `createBooking` from the same price list,
 * so a court is priced from the row rather than recomputed — which is what
 * makes a price rise safe for somebody who booked before it.
 */

import 'server-only';

import { courtName } from './availability';
import { getBookingDetail } from './bookings';
import { getEnrolment } from './enrolments';
import { getLead } from './leads';
import { getPlayer } from './players';
import type { Payment } from './payments';
import { MEMBERSHIP_TIERS, fmtTsh, lapses, type MembershipTier } from './pricing';
import { fmtLongDay, fmtRange } from './time';

/** One thing the club is charging for, ready to be paid or displayed. */
export type Purchase = {
  /** The headline on the payment page, and on a provider's form. */
  title: string;
  /** The second line: when, which court, which term. */
  detail: string;
  /** Whole shillings. Derived here; never supplied by a caller. */
  amount: number;
  /** Who is paying, as far as the club knows. */
  customer: { name: string; phone: string; email: string };
  /**
   * Which membership this buys a term of. Set only for a membership, and
   * carried out of here rather than looked up again by the caller: the tier
   * a renewal is priced at and the tier it extends must be the same one.
   */
  tier?: MembershipTier;
};

export type Priced = { ok: true; purchase: Purchase } | { ok: false; error: string };

/**
 * Payment providers generally require an email on every charge and the club
 * frequently does not have one — /book asks for it as optional, and a third
 * of the roster has no number, let alone an address.
 *
 * So one is synthesised from the payment id. It is deliverable nowhere,
 * which is correct: the club's receipts go out over WhatsApp, and inventing
 * a plausible-looking address on somebody else's domain would be worse than
 * an obviously internal one. The real address is used whenever there is one.
 */
export function emailFor(given: string | null | undefined, id: string): string {
  const trimmed = (given ?? '').trim();
  return trimmed || `no-reply+${id.slice(0, 8)}@meruclay.invalid`;
}

/** "TSh 30,000" — the one place the currency is spelled out for a payer. */
export function money(amount: number): string {
  return `TSh ${fmtTsh(amount)}`;
}

/* ------------------------------------------------------------- forwards */

/*
 * There is no `priceBooking` here, and paying for a court online is not
 * offered: a booking is held and settled at the desk, as it always was.
 * `describePayment` below still renders a payment whose purpose is
 * 'booking', because the ledger can hold one — the desk recording cash, say
 * — and `fulfil` still knows how to confirm the court behind it.
 */

/**
 * A membership being renewed.
 *
 * Priced from the tier the member is actually on, not from one they picked
 * on a form. Pay as you play has no term and so cannot be renewed — see
 * `lapses` in src/lib/pricing.ts — and saying so is better than charging
 * zero shillings and calling it a renewal.
 */
export async function priceRenewal(playerId: number): Promise<Priced> {
  const p = await getPlayer(playerId);
  if (!p) return { ok: false, error: 'That member is not on the roster.' };

  const tier = MEMBERSHIP_TIERS[p.membership];
  if (!lapses(p.membership)) {
    return { ok: false, error: `${tier.label} has no membership fee to pay.` };
  }

  return {
    ok: true,
    purchase: {
      title: `${tier.label} membership`,
      detail: p.paidUntil
        ? `Renewal · paid up to ${p.paidUntil}`
        : `${tier.months} month${tier.months === 1 ? '' : 's'} · ${tier.detail}`,
      amount: tier.fee,
      customer: { name: p.name, phone: p.phone, email: emailFor(p.email, String(p.id)) },
      tier: p.membership,
    },
  };
}

/** Somebody joining off the leads board, paying their first term up front. */
export async function priceJoin(leadId: number, want: MembershipTier): Promise<Priced> {
  const lead = await getLead(leadId);
  if (!lead) return { ok: false, error: 'No such enquiry.' };
  if (lead.playerId) return { ok: false, error: 'They have already joined.' };

  const tier = MEMBERSHIP_TIERS[want];
  if (!lapses(want)) {
    return { ok: false, error: `${tier.label} has nothing to pay up front.` };
  }

  return {
    ok: true,
    purchase: {
      title: `${tier.label} membership`,
      detail: `Joining Meru Clay · ${tier.detail}`,
      amount: tier.fee,
      customer: {
        name: lead.name,
        phone: lead.phone,
        email: emailFor(lead.email, String(lead.id)),
      },
      tier: want,
    },
  };
}

/** A place in a club class. Free sessions have nothing to charge for. */
export async function priceClass(enrolmentId: number): Promise<Priced> {
  const e = await getEnrolment(enrolmentId);
  if (!e) return { ok: false, error: 'No such class place.' };
  if (e.paid) return { ok: false, error: 'That place is already paid.' };
  if (e.amount <= 0) return { ok: false, error: 'That class is free.' };

  return {
    ok: true,
    purchase: {
      title: e.className,
      detail: `${fmtLongDay(e.date)} · ${courtName(e.court)}`,
      amount: e.amount,
      customer: { name: e.name, phone: e.phone, email: emailFor(null, String(e.id)) },
    },
  };
}

/* ------------------------------------------------------------ backwards */

/**
 * What an existing payment is for, for the page the payer is looking at.
 *
 * Deliberately tolerant: a payment whose target has since been cancelled
 * still has to render, because that is exactly the situation somebody needs
 * an explanation of. It falls back to what the payment row itself remembers
 * rather than refusing to draw.
 */
export async function describePayment(p: Payment): Promise<{ title: string; detail: string }> {
  if (p.purpose === 'booking' && p.bookingId) {
    const b = await getBookingDetail(p.bookingId);
    if (b) {
      return {
        title: `${courtName(b.court_id)} · ${fmtLongDay(b.date)}`,
        detail: [
          fmtRange(b.start_min, b.end_min),
          b.coach ? 'with a coach' : 'court only',
        ].join(' · '),
      };
    }
    return { title: 'Court booking', detail: 'This booking is no longer on the calendar.' };
  }

  if (p.purpose === 'membership' && p.tier) {
    const tier = MEMBERSHIP_TIERS[p.tier];
    return {
      title: `${tier.label} membership`,
      detail: p.playerId ? 'Renewal' : 'Joining Meru Clay',
    };
  }

  if (p.purpose === 'class' && p.enrolmentId) {
    const e = await getEnrolment(p.enrolmentId);
    if (e) return { title: e.className, detail: `${fmtLongDay(e.date)} · ${courtName(e.court)}` };
    return { title: 'Class place', detail: 'This place is no longer on the register.' };
  }

  return { title: 'Meru Clay', detail: '' };
}
