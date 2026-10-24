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
 *   COACHING — nothing on top. The club charges the same for a court with a
 *   coach as without: 30k an hour, 45k for an hour and a half. Kept as its
 *   own line so a coaching surcharge, if one ever comes back, goes here
 *   rather than into COURT_HIRE.
 */

import type { Duration } from './time';

export const COURT_HIRE: Record<Duration, number> = {
  60: 30_000,
  90: 45_000,
};

export const COACHING: Record<Duration, number> = {
  60: 0,
  90: 0,
};

export function totalFor(duration: Duration, withCoach: boolean): number {
  return COURT_HIRE[duration] + (withCoach ? COACHING[duration] : 0);
}

/**
 * The paid trial session sold off the ads — /trial. One price, paid up front
 * by mobile money, which is what makes a booking from a stranger worth the
 * coach keeping a slot for.
 */
export const TRIAL_FEE = 15_000;

/** How far ahead somebody can pick their trial day, starting tomorrow. */
export const TRIAL_WINDOW_DAYS = 21;

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
  /**
   * Sold on the website alongside the session packs. A child on the roster
   * under a parent's number; what it buys — every group class — is honoured
   * at the desk, not counted anywhere.
   */
  kids: {
    label: 'Kids',
    fee: 80_000,
    months: 1,
    detail: 'Unlimited group classes · rolls over',
  },
  payg: {
    label: 'Pay as you play',
    fee: 0,
    months: 0,
    detail: 'Visitor rate per booking · off the ladder',
  },
  /**
   * Prepaid sessions, bought on the website — see `SESSION_PACKS`. No fee and
   * no term of its own: what they have left is counted from `session_packs`,
   * so there is nothing here that can fall due.
   */
  pack: {
    label: 'Session pack',
    fee: 0,
    months: 0,
    detail: 'Prepaid sessions · booked online',
  },
} as const;

export const MEMBERSHIPS = ['monthly', 'term', 'kids', 'payg', 'pack'] as const;
export type MembershipTier = (typeof MEMBERSHIPS)[number];

export function isMembership(value: unknown): value is MembershipTier {
  return typeof value === 'string' && (MEMBERSHIPS as readonly string[]).includes(value);
}

/** Only a tier with a term can lapse. */
export function lapses(tier: MembershipTier): boolean {
  return MEMBERSHIP_TIERS[tier].months > 0;
}

/**
 * Membership as the website sells it: a pack of sessions, paid up front.
 *
 * One session is one court booking, of either length, made with the phone
 * number the pack was paid from. What somebody has left is never stored —
 * it is the sessions they bought less the live bookings made against them,
 * so cancelling a booking hands its session straight back. See
 * `session_packs` in src/lib/db/schema.ts.
 *
 * The top pack is sold as "16–20 sessions" and credits twenty.
 */
export const SESSION_PACKS = [
  { sessions: 4, fee: 100_000, label: '4 sessions' },
  { sessions: 8, fee: 175_000, label: '8 sessions' },
  { sessions: 12, fee: 250_000, label: '12 sessions' },
  { sessions: 20, fee: 350_000, label: '16–20 sessions' },
] as const;

export type PackSize = (typeof SESSION_PACKS)[number]['sessions'];

export function packOf(sessions: number) {
  return SESSION_PACKS.find((p) => p.sessions === sessions) ?? null;
}
