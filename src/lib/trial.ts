/**
 * The paid trial's place on the courts.
 *
 * A trial is an hour with the coach, and the coach is always there for one,
 * so it asks availability only which starts have a court free. The visitor
 * picks one of those. Nothing is held while they pay — a
 * trial's payment link lives for hours, far longer than a court hold — so the
 * court is taken once the money is in, by `reserveTrial`, and the desk is told
 * if somebody got there first.
 */

import { NOTICE_MINUTES, courtName, earliestStart, freeSlots, occupancy } from './availability';
import { blocksOn, createBooking, liveBookings } from './bookings';
import type { Payment } from './payments';
import { fmtTime24, nowLocal, type LocalNow } from './time';

/** "Your first hour": a trial is always this long, and always coached. */
export const TRIAL_MINUTES = 60;

/** Courts free for a trial starting at `start` on `date`, best first. */
async function courtsFreeAt(date: string, start: number, now: LocalNow): Promise<number[]> {
  const [bookings, blocks] = await Promise.all([liveBookings(date, now.epochMs), blocksOn(date)]);
  return freeSlots(
    TRIAL_MINUTES,
    occupancy(date, bookings, blocks),
    earliestStart(date, NOTICE_MINUTES, now),
  )
    .filter((s) => s.start === start)
    .map((s) => s.court);
}

/** Can a trial still start then? What the form is checked against. */
export async function trialStartFree(date: string, start: number, now = nowLocal()): Promise<boolean> {
  return (await courtsFreeAt(date, start, now)).length > 0;
}

export type Reserved =
  | { ok: true; court: string; when: string }
  | { ok: false; when: string | null; reason: string };

/**
 * Put a paid trial on a court, confirmed and paid.
 *
 * Priced at nothing on the booking: the money is on the trial payment, and
 * counting it twice would put it on the court takings as well. Not marked
 * as coached either: that flag makes a booking take the coach off every
 * court, and a trial never does. Tries each free court, so losing a race on
 * one falls through to the other. Never throws — the trial is paid either
 * way, and the desk can place it by hand from the reason.
 */
export async function reserveTrial(p: Payment): Promise<Reserved> {
  if (!p.sessionDate || p.sessionStart === null) {
    return { ok: false, when: null, reason: 'No time was picked — message them one.' };
  }
  const when = `${fmtTime24(p.sessionStart)}–${fmtTime24(p.sessionStart + TRIAL_MINUTES)}`;

  try {
    for (const court of await courtsFreeAt(p.sessionDate, p.sessionStart, nowLocal())) {
      const made = await createBooking(
        {
          court,
          date: p.sessionDate,
          start: p.sessionStart,
          duration: TRIAL_MINUTES,
          name: p.name,
          phone: p.phone,
          notes: `Paid trial, with the coach (${p.id.slice(0, 8)})`,
          confirmed: true,
          paid: true,
          amount: 0,
        },
        Date.now(),
      );
      if (made.ok) return { ok: true, court: courtName(court), when };
    }
  } catch (err) {
    console.error('trial court not reserved:', err);
    return { ok: false, when, reason: 'Could not put it on a court — add it on the desk.' };
  }
  return { ok: false, when, reason: 'That time was taken before they paid — find them another.' };
}
