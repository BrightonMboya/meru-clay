/**
 * What a booking costs, in Tanzanian shillings.
 *
 * Two figures, with very different confidence:
 *
 *   COURT_HIRE — ⚠️ UNCONFIRMED. The published list in Pricing.astro prices
 *   *coaching* only; it has no line for hiring a court without a coach, which
 *   is what /book mostly sells. These mirror the adult private rate as a
 *   placeholder. Confirm with the club before launch.
 *
 *   COACHING — the published adult private-lesson rate, straight off the price
 *   list. Added on top of the court. If the club's private rate already covers
 *   the court, zero this out rather than discounting COURT_HIRE, so the two
 *   numbers keep meaning what their names say.
 */

import type { Duration } from './time';

export const COURT_HIRE: Record<Duration, number> = {
  60: 30_000,
  90: 45_000,
};

export const COACHING: Record<Duration, number> = {
  60: 30_000,
  90: 45_000,
};

export function totalFor(duration: Duration, withCoach: boolean): number {
  return COURT_HIRE[duration] + (withCoach ? COACHING[duration] : 0);
}

/** 30000 → "30,000". Plain grouping; the currency is stated once in the UI. */
export function fmtTsh(amount: number): string {
  return amount.toLocaleString('en-US');
}

/**
 * Membership, in Tanzanian shillings.
 *
 * ⚠️ UNCONFIRMED, like COURT_HIRE above. These are the three tiers and the
 * two prices drawn on the "Add a member" screen in the Paper file; the club's
 * published price list has no membership section. Confirm before launch.
 *
 * `months` is what "mark them paid" advances `paid_until` by. Pay as you play
 * has no term, which is what makes it the one tier that can never fall due.
 */
export const MEMBERSHIP_TIERS = {
  monthly: {
    label: 'Monthly',
    fee: 90_000,
    months: 1,
    detail: 'Court time at member rate · rolls over',
  },
  term: {
    label: 'Term',
    fee: 240_000,
    months: 3,
    detail: 'Three months · two free coached hits',
  },
  payg: {
    label: 'Pay as you play',
    fee: 0,
    months: 0,
    detail: 'Visitor rate per booking · off the ladder',
  },
} as const;

export const MEMBERSHIPS = ['monthly', 'term', 'payg'] as const;
export type MembershipTier = (typeof MEMBERSHIPS)[number];

export function isMembership(value: unknown): value is MembershipTier {
  return typeof value === 'string' && (MEMBERSHIPS as readonly string[]).includes(value);
}

/** Only a tier with a term can lapse. */
export function lapses(tier: MembershipTier): boolean {
  return MEMBERSHIP_TIERS[tier].months > 0;
}
