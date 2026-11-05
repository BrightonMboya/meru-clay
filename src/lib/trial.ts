/**
 * A trial's place on the courts.
 *
 * A trial is an hour with the coach, and the coach is always there for one,
 * so it asks availability only which starts have a court free. The visitor
 * picks one of those.
 *
 * Trials are paid in cash at the court, after the session: `bookTrial` takes
 * the court the moment the form is sent, owing `TRIAL_FEE`, and the trial row
 * records who is coming. The desk marks it paid when the cash is in hand. The
 * online-paid trial before it took its court only once the money was in, by
 * `reserveTrial`; that stays for payments opened back then, which can still
 * settle.
 */

import { and, asc, between, eq, gte } from 'drizzle-orm';
import { NOTICE_MINUTES, courtName, earliestStart, freeSlots, occupancy } from './availability';
import { blocksOn, createBooking, getBooking, liveBookings, type Booking } from './bookings';
import { db } from './db/client';
import { leads, trials, type TrialRecord } from './db/schema';
import type { Payment } from './payments';
import { TRIAL_LEVEL_LABELS, type TrialLevel, type TrialPlayer } from './pipeline';
import { TRIAL_FEE, fmtTsh } from './pricing';
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
 * Put a paid trial on a court, confirmed and paid — for payments opened
 * before trials moved to cash at the court. Never throws: the trial is paid either way, and
 * the desk can place it by hand from the reason.
 */
export async function reserveTrial(p: Payment): Promise<Reserved> {
  if (!p.sessionDate || p.sessionStart === null) {
    return { ok: false, when: null, reason: 'No time was picked — message them one.' };
  }
  const when = `${fmtTime24(p.sessionStart)}–${fmtTime24(p.sessionStart + TRIAL_MINUTES)}`;

  try {
    const made = await placeOnCourt(p.sessionDate, p.sessionStart, {
      name: p.name,
      phone: p.phone,
      notes: `Paid trial, with the coach (${p.id.slice(0, 8)})`,
      owes: 0,
    });
    if (made) return { ok: true, court: courtName(made.court_id), when };
  } catch (err) {
    console.error('trial court not reserved:', err);
    return { ok: false, when, reason: 'Could not put it on a court — add it on the desk.' };
  }
  return { ok: false, when, reason: 'That time was taken before they paid — find them another.' };
}

/**
 * Take the first free court for a trial hour, confirmed.
 *
 * `owes` is what is still to collect at the court. A cash trial owes
 * `TRIAL_FEE`, so it sits on the desk unpaid — counted in "still owed" until
 * somebody marks it paid. An online-paid one owes nothing: its money is on its
 * payment. Not marked as coached either: that flag makes a booking take the
 * coach off every court, and a trial never does. Tries each free court, so
 * losing a race on one falls through to the other. Null when none is left.
 */
async function placeOnCourt(
  date: string,
  start: number,
  { owes, ...who }: { name: string; phone: string; notes: string; owes: number },
): Promise<Booking | null> {
  for (const court of await courtsFreeAt(date, start, nowLocal())) {
    const made = await createBooking(
      {
        court,
        date,
        start,
        duration: TRIAL_MINUTES,
        ...who,
        confirmed: true,
        paid: owes === 0,
        amount: owes,
      },
      Date.now(),
    );
    if (made.ok) return made.booking;
  }
  return null;
}

/**
 * How many upcoming trials one number may hold. Enough for a parent with
 * three children; few enough that a stranger cannot fill a week of courts
 * from one phone without paying a shilling up front.
 */
export const TRIALS_PER_NUMBER = 3;

export type TrialRequest = {
  leadId: number;
  /** The grown-up: the parent for a child, the player otherwise. */
  name: string;
  phone: string;
  date: string;
  start: number;
  player: TrialPlayer;
  childName: string | null;
  childAge: number | null;
  level: TrialLevel;
  notes: string | null;
};

export type BookedTrial =
  | { ok: true; trial: TrialRecord; court: string; repeat: boolean }
  | { ok: false; reason: 'taken' | 'too-many' };

/**
 * Book a trial: put it on a court, owing `TRIAL_FEE` in cash, and write down
 * who is coming.
 *
 * Sending the same form twice — a double tap, or a reload — finds the trial
 * already there rather than taking a second court. Anything else from the
 * same number is another trial, which is how a parent books two children,
 * up to `TRIALS_PER_NUMBER` still to come.
 */
export async function bookTrial(r: TrialRequest): Promise<BookedTrial> {
  const today = nowLocal().date;
  const upcoming = await db
    .select()
    .from(trials)
    .where(and(eq(trials.leadId, r.leadId), gte(trials.date, today)));

  const same = upcoming.find(
    (t) =>
      t.date === r.date &&
      t.startMin === r.start &&
      t.player === r.player &&
      (t.childName ?? '').toLowerCase() === (r.childName ?? '').toLowerCase(),
  );
  if (same) return { ok: true, trial: same, court: await courtOf(same), repeat: true };
  if (upcoming.length >= TRIALS_PER_NUMBER) return { ok: false, reason: 'too-many' };

  const booking = await placeOnCourt(r.date, r.start, {
    name: r.player === 'child' ? `${r.childName} (${r.childAge}) — ${r.name}` : r.name,
    phone: r.phone,
    notes: trialNotes(r),
    owes: TRIAL_FEE,
  });
  if (!booking) return { ok: false, reason: 'taken' };

  const [trial] = await db
    .insert(trials)
    .values({
      leadId: r.leadId,
      bookingId: booking.id,
      date: r.date,
      startMin: r.start,
      player: r.player,
      childName: r.childName,
      childAge: r.childAge,
      level: r.level,
      notes: r.notes,
    })
    .returning();

  return { ok: true, trial: trial!, court: courtName(booking.court_id), repeat: false };
}

/** What the coach reads on the court sheet. */
export function trialNotes(
  r: Pick<TrialRequest, 'player' | 'childAge' | 'level' | 'notes' | 'name'>,
): string {
  return [
    r.player === 'child' ? `Kids trial, age ${r.childAge}. Parent: ${r.name}` : 'Trial',
    `Pays TSh ${fmtTsh(TRIAL_FEE)} cash after`,
    TRIAL_LEVEL_LABELS[r.level],
    r.notes,
  ]
    .filter(Boolean)
    .join(' · ');
}

async function courtOf(t: TrialRecord): Promise<string> {
  const b = t.bookingId ? await getBooking(t.bookingId) : null;
  return b ? courtName(b.court_id) : '';
}

/** A trial, with the grown-up who booked it — what the coach needs to know. */
export type TrialForCoach = TrialRecord & { parentName: string };

/** Every trial from `from` to `to` inclusive, with the booker's name. */
export async function trialsBetween(from: string, to: string): Promise<TrialForCoach[]> {
  const rows = await db
    .select({ trial: trials, parentName: leads.name })
    .from(trials)
    .innerJoin(leads, eq(leads.id, trials.leadId))
    .where(between(trials.date, from, to))
    .orderBy(asc(trials.date), asc(trials.startMin));
  return rows.map((r) => ({ ...r.trial, parentName: r.parentName }));
}
