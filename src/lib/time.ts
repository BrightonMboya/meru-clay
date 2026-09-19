/**
 * Time helpers for Meru Clay.
 *
 * The club exists in exactly one timezone — Africa/Dar_es_Salaam, UTC+3, which
 * has no daylight saving and never has. That single fact lets us drop timezone
 * handling entirely: a slot is a `YYYY-MM-DD` date string plus an integer
 * number of minutes from local midnight, and comparing two slots is comparing
 * two integers. No Date arithmetic, no UTC conversion, no DST edge cases.
 */

/** Africa/Dar_es_Salaam, fixed offset. */
const TZ_OFFSET_MIN = 3 * 60;

/** Court opening hours (Visit.astro: "Daily, 06:00 — 21:00"). */
export const OPEN_MIN = 6 * 60;
export const CLOSE_MIN = 21 * 60;
/**
 * Last minute a court without floodlights is playable. Arusha sits 3° south of
 * the equator, so dusk barely moves across the year — one constant is enough.
 */
export const DUSK_MIN = 18 * 60 + 45;

/** Bookable start times land on this grid. Covers every class start time. */
export const STEP_MIN = 30;

/** Bookable durations, matching the drop-in prices in Pricing.astro. */
export const DURATIONS = [60, 90] as const;
export type Duration = (typeof DURATIONS)[number];

/** How long an unpaid booking holds its slot before another player can take it. */
export const HOLD_MINUTES = 10;

/** Furthest ahead a player may book. */
export const BOOKING_WINDOW_DAYS = 14;

export type LocalNow = { date: string; minutes: number; epochMs: number };

/** Current wall-clock time at the club. */
export function nowLocal(epochMs: number = Date.now()): LocalNow {
  const shifted = new Date(epochMs + TZ_OFFSET_MIN * 60_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    epochMs,
  };
}

/** Day of week for an ISO date, 0 = Sunday (matches Date#getUTCDay). */
export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of dates a player is allowed to book, starting today. */
export function bookableDates(from: string = nowLocal().date): string[] {
  return Array.from({ length: BOOKING_WINDOW_DAYS }, (_, i) => addDays(from, i));
}

export function isValidDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** "16:30" -> 990 */
export function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** 990 -> "4:30 PM" */
export function fmtTime(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** 990 -> "16:30". The booking grid reads as 24-hour; the marketing copy doesn't. */
export function fmtTime24(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * "4:00 – 5:30 PM" — the meridiem is printed once when both ends share it,
 * which is how the published schedule reads.
 */
export function fmtRange(start: number, end: number): string {
  const sameHalf = start < 720 === end < 720;
  const left = sameHalf ? fmtTime(start).replace(/ [AP]M$/, '') : fmtTime(start);
  return `${left} – ${fmtTime(end)}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-09-19" -> "September 2026". The calendar popover's heading. */
export function fmtMonthYear(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * The same day-of-month `months` away, clamped to the end of a shorter month
 * — stepping from 31 Jan lands on 28 Feb, not on 3 March.
 */
export function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastOfMonth));
  return d.toISOString().slice(0, 10);
}

/**
 * Six weeks of ISO dates covering the month `isoDate` falls in, Monday first.
 *
 * Always 42 cells, so the calendar is the same height in every month and
 * opening it never shoves the page around. The leading and trailing cells
 * belong to the neighbouring months — `isSameMonth` tells them apart.
 */
export function monthGrid(isoDate: string): string[] {
  const first = new Date(`${isoDate.slice(0, 7)}-01T00:00:00Z`);
  // getUTCDay is 0 = Sunday; shift so Monday is the first column.
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** Do these two ISO dates fall in the same calendar month? */
export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Sat 20 Sep — short human label for the date picker. */
export function fmtDayLabel(isoDate: string): { dow: string; day: string; mon: string } {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return {
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()],
    day: String(d.getUTCDate()),
    mon: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()],
  };
}

/** Monday 14 September — the long form used in the booking summary. */
export function fmtLongDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
  const mon = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'][d.getUTCMonth()];
  return `${dow} ${d.getUTCDate()} ${mon}`;
}

/** The only real logic in the availability engine. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Monday 14 Sep — the court desk's day stepper. Spelled out here rather than
 * via toLocaleDateString so the wording cannot shift with the server's locale
 * or ICU build (en-GB abbreviates September to "Sept", en-US to "Sep").
 */
export function fmtDeskDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    d.getUTCDay()
  ];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ];
  return `${dow} ${d.getUTCDate()} ${mon}`;
}
