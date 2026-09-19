/**
 * The weekly class grid — the single source of truth.
 *
 * Two things read this file, and they must never disagree:
 *   1. Pricing.astro, to render the published schedule.
 *   2. availability.ts, to know when a court is already occupied by a class.
 *
 * If these drifted apart, the booking system would happily sell a court that
 * is in the middle of a junior clinic. Hence one file, in minutes.
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

export const WEEK: ScheduleDay[] = [
  {
    weekday: 1,
    label: 'MON',
    weekend: false,
    showRange: true,
    rows: [
      { ...at('16:00', '17:30'), name: 'Teens lesson', age: '13–17 yrs', court: 1 },
      // Overlaps the teens lesson 17:00–17:30, so it has to run on court 2.
      { ...at('17:00', '18:00'), name: 'Women clinic', court: 2 },
      { ...at('19:00', '20:00'), name: 'Mixed clinic', court: 1 },
    ],
  },
  {
    weekday: 2,
    label: 'TUE',
    weekend: false,
    showRange: true,
    rows: [
      { ...at('16:00', '17:00'), name: 'Pre-teens lesson', age: '10–12 yrs', court: 1 },
      { ...at('17:00', '18:00'), name: 'Mixed clinic', court: 1 },
      { ...at('19:00', '20:00'), name: 'Women clinic', court: 1 },
    ],
  },
  {
    weekday: 3,
    label: 'WED',
    weekend: false,
    showRange: true,
    rows: [
      { ...at('16:00', '17:00'), name: 'Juniors lesson', age: '7–9 yrs', court: 1 },
      { ...at('17:00', '18:00'), name: 'Women clinic', court: 1 },
      { ...at('19:00', '20:00'), name: 'Mixed clinic', court: 1 },
    ],
  },
  {
    weekday: 4,
    label: 'THU',
    weekend: false,
    showRange: true,
    rows: [
      { ...at('16:00', '17:00'), name: 'Tots lesson', age: '4–6 yrs', court: 1 },
      { ...at('17:00', '18:00'), name: 'Mixed clinic', court: 1 },
      { ...at('19:00', '20:00'), name: 'Women clinic', court: 1 },
    ],
  },
  {
    weekday: 5,
    label: 'FRI',
    weekend: false,
    showRange: true,
    rows: [
      { ...at('17:30', '19:00'), name: 'Women social', court: 1 },
      { ...at('19:00', '20:30'), name: 'Mixed social', court: 1 },
    ],
  },
  {
    weekday: 6,
    label: 'SAT',
    weekend: true,
    showRange: false,
    rows: [
      { ...at('09:00', '10:00'), name: 'Tots', age: '4–6 yrs', court: 1 },
      { ...at('10:00', '11:00'), name: 'Juniors', age: '7–9 yrs', court: 1 },
      { ...at('11:00', '12:00'), name: 'Pre-teens', age: '10–12 yrs', court: 1 },
      { ...at('13:00', '14:00'), name: 'Teens', age: '13–17 yrs', court: 1 },
      { ...at('16:30', '18:00'), name: 'Mixed social', court: 1 },
    ],
  },
  {
    weekday: 0,
    label: 'SUN',
    weekend: true,
    showRange: false,
    rows: [
      { ...at('09:00', '10:00'), name: 'Tots', age: '4–6 yrs', court: 1 },
      { ...at('10:00', '11:00'), name: 'Juniors', age: '7–9 yrs', court: 1 },
      { ...at('11:00', '12:00'), name: 'Pre-teens', age: '10–12 yrs', court: 1 },
      { ...at('13:00', '14:00'), name: 'Teens', age: '13–17 yrs', court: 1 },
      { ...at('16:30', '18:00'), name: 'Women social', court: 1 },
    ],
  },
];

/** Rendering order for the published grid: Monday first. */
export const WEEK_IN_DISPLAY_ORDER = WEEK;

/** Classes occupying a court on a given weekday. */
export function classesOn(weekday: number): ClassRow[] {
  return WEEK.find((d) => d.weekday === weekday)?.rows ?? [];
}

/**
 * Court maintenance. Visit.astro says courts are watered at noon and 5pm;
 * the 5pm slot collides with the published evening clinics, so only the noon
 * block is enforced here. Move this into a `blocks` table once the club wants
 * to close courts ad hoc.
 */
export const DAILY_BLOCKS: { start: number; end: number; reason: string }[] = [
  { start: parseHHMM('12:00'), end: parseHHMM('12:30'), reason: 'Courts watered' },
];
