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
