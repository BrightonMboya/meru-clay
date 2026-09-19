/**
 * The weekly class grid — the single source of truth.
 *
 * Two things read this file, and they must never disagree:
 *   1. Pricing.tsx, to render the published schedule.
 *   2. availability.ts, to know when a court is already occupied by a class.
 *
 * If these drifted apart, the booking system would happily sell a court that
 * is in the middle of a class. Hence one file, in minutes.
 *
 * Only put a session here once the club actually runs it. Everything that
 * reads this file treats a row as fact: the desk draws it on the day, /book
 * refuses to sell the court under it, and the pricing page publishes it to
 * players. Today that is one session — Friday social tennis.
 */

import { parseHHMM } from './time';

export type ClassRow = {
  /** Minutes from local midnight. */
  start: number;
  end: number;
  name: string;
  /** Age band, shown under the class name. */
  age?: string;
  /** Which court the class occupies. Court A (id 1) is the floodlit one. */
  court: number;
};

export type ScheduleDay = {
  /** 0 = Sunday, matching Date#getUTCDay. */
  weekday: number;
  label: string;
  weekend: boolean;
  /** Weekday rows publish a time range; weekend rows publish a start time. */
  showRange: boolean;
  rows: ClassRow[];
};

const at = (from: string, to: string) => ({ start: parseHHMM(from), end: parseHHMM(to) });

/**
 * How one running of a class is named.
 *
 * Classes have no id — this file is the timetable, and it is code — so an
 * occurrence is identified by the court and start minute it runs at on a date.
 * A court hosts one class at a time, so that is enough. Enrolment rows are
 * keyed on it; keep both sides going through here rather than formatting the
 * string by hand.
 */
export function classKey(court: number, startMin: number): string {
  return `${court}:${startMin}`;
}

export const WEEK: ScheduleDay[] = [
  { weekday: 1, label: 'MON', weekend: false, showRange: true, rows: [] },
  { weekday: 2, label: 'TUE', weekend: false, showRange: true, rows: [] },
  { weekday: 3, label: 'WED', weekend: false, showRange: true, rows: [] },
  { weekday: 4, label: 'THU', weekend: false, showRange: true, rows: [] },
  {
    weekday: 5,
    label: 'FRI',
    weekend: false,
    showRange: true,
    rows: [
      // The club's one standing session. It runs to close of play, so it has
      // to be on the floodlit court — court 2 is dark from 18:45.
      { ...at('18:30', '21:00'), name: 'Social tennis', court: 1 },
    ],
  },
  { weekday: 6, label: 'SAT', weekend: true, showRange: true, rows: [] },
  { weekday: 0, label: 'SUN', weekend: true, showRange: true, rows: [] },
];

/** Rendering order for the published grid: Monday first. */
export const WEEK_IN_DISPLAY_ORDER = WEEK;

/** Classes occupying a court on a given weekday. */
export function classesOn(weekday: number): ClassRow[] {
  return WEEK.find((d) => d.weekday === weekday)?.rows ?? [];
}
