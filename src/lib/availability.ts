/**
 * Availability.
 *
 * Not a search problem. Two courts, fixed 06:00–21:00 opening hours and a
 * 30-minute grid give 60 cells a day — small enough to enumerate and subtract
 * what is already taken. The whole engine is `freeSlots` below.
 */

import { classesOn, DAILY_BLOCKS } from './schedule';
import {
  CLOSE_MIN,
  DUSK_MIN,
  OPEN_MIN,
  STEP_MIN,
  fmtTime,
  nowLocal,
  overlaps,
  weekdayOf,
  type Duration,
} from './time';

export type Interval = { court: number; start: number; end: number; reason: string };
export type Slot = { court: number; start: number; end: number; label: string; floodlit: boolean };

export const COURTS = [
  { id: 1, name: 'Court A', floodlit: true },
  { id: 2, name: 'Court B', floodlit: false },
];

/**
 * Display name for a court. The id is what the database stores; the letter is
 * what players are told, so everything user-facing goes through here rather
 * than interpolating the number.
 */
export function courtName(courtId: number): string {
  return COURTS.find((c) => c.id === courtId)?.name ?? `Court ${courtId}`;
}

/**
 * Latest minute play can *finish* on a court. Only Court A has floodlights, so
 * Court B stops at dusk however long the club stays open.
 */
export function lastPlay(courtId: number): number {
  return COURTS.find((c) => c.id === courtId)?.floodlit ? CLOSE_MIN : DUSK_MIN;
}

export type BookingRow = {
  court_id: number;
  start_min: number;
  end_min: number;
  /** 1 when the player also booked the coach. */
  coach?: number;
};

export type BlockRow = {
  court_id: number | null;
  start_min: number;
  end_min: number;
  reason: string | null;
};

/**
 * Everything occupying a court on `date`: scheduled classes, live bookings and
 * closures — flattened to one shape so the slot loop only has to subtract.
 *
 * `withCoach` asks a second question on top of "is the court free?": is the
 * *coach* free? There is one coach, so anything they are already running —
 * a class, or another coached booking — rules out that time on both courts,
 * not just the one it occupies.
 */
export function occupancy(
  date: string,
  bookings: BookingRow[],
  blocks: BlockRow[] = [],
  { withCoach = false }: { withCoach?: boolean } = {},
): Interval[] {
  const out: Interval[] = [];
  const everyCourt = COURTS.map((c) => c.id);

  for (const c of classesOn(weekdayOf(date))) {
    // A class ties up its court always, and the coach as well.
    const courts = withCoach ? everyCourt : [c.court];
    for (const court of courts) {
      out.push({ court, start: c.start, end: c.end, reason: c.name });
    }
  }

  for (const b of DAILY_BLOCKS) {
    for (const court of COURTS) {
      out.push({ court: court.id, start: b.start, end: b.end, reason: b.reason });
    }
  }

  for (const b of blocks) {
    const courts = b.court_id == null ? COURTS.map((c) => c.id) : [b.court_id];
    for (const court of courts) {
      out.push({ court, start: b.start_min, end: b.end_min, reason: b.reason ?? 'Unavailable' });
    }
  }

  for (const b of bookings) {
    const courts = withCoach && b.coach ? everyCourt : [b.court_id];
    for (const court of courts) {
      out.push({ court, start: b.start_min, end: b.end_min, reason: 'Booked' });
    }
  }

  return out;
}

/**
 * Free start times for a booking of `duration` minutes.
 *
 * `minStart` drops slots that have already begun — passed in rather than read
 * from the clock so this stays a pure function and is trivially testable.
 */
export function freeSlots(
  duration: Duration,
  occupied: Interval[],
  minStart = -Infinity,
): Slot[] {
  const slots: Slot[] = [];

  for (const court of COURTS) {
    const busy = occupied.filter((o) => o.court === court.id);

    const closes = lastPlay(court.id);

    for (let start = OPEN_MIN; start + duration <= closes; start += STEP_MIN) {
      if (start < minStart) continue;
      const end = start + duration;
      if (busy.some((b) => overlaps(start, end, b.start, b.end))) continue;

      slots.push({
        court: court.id,
        start,
        end,
        label: fmtTime(start),
        floodlit: court.floodlit,
      });
    }
  }

  return slots.sort((a, b) => a.start - b.start || a.court - b.court);
}

/**
 * Earliest bookable minute on `date` — the open time on a future day, or
 * "the next grid step from now, plus a little notice" when it is today.
 */
export function earliestStart(date: string, noticeMinutes = 60, now = nowLocal()): number {
  if (date > now.date) return OPEN_MIN;
  if (date < now.date) return Infinity;
  const soonest = now.minutes + noticeMinutes;
  return Math.ceil(soonest / STEP_MIN) * STEP_MIN;
}

/**
 * What, if anything, is in the way of a specific window on a specific court.
 *
 * `freeSlots` answers "what may I offer?" and is bounded by the notice window
 * and the 30-minute grid. This answers the narrower question the desk asks —
 * "can I put this exact booking here?" — and returns the reason it cannot, so
 * the operator is told *what* is in the way rather than just being refused.
 */
export function conflictAt(
  court: number,
  start: number,
  end: number,
  occupied: Interval[],
): string | null {
  const clash = occupied.find((o) => o.court === court && overlaps(start, end, o.start, o.end));
  if (clash) return clash.reason;
  if (end > lastPlay(court)) {
    return court === 1 ? 'After close of play' : 'Too dark — no floodlights';
  }
  if (start < OPEN_MIN) return 'Before the club opens';
  return null;
}

/** Is this a start time the booking form is allowed to offer at all? */
export function isValidStart(start: number, duration: number, court?: number): boolean {
  return (
    Number.isInteger(start) &&
    start % STEP_MIN === 0 &&
    start >= OPEN_MIN &&
    start + duration <= (court == null ? CLOSE_MIN : lastPlay(court))
  );
}
