/**
 * The court desk's day.
 *
 * Three kinds of thing land on this timeline, from three places:
 *
 *   Club sessions are *derived* — read straight out of src/lib/schedule.ts,
 *   the same file the booking engine reads. The desk therefore cannot
 *   disagree with what /book will sell, which is the whole reason that file
 *   exists.
 *
 *   Dusk is a fact about the court, from `lastPlay`.
 *
 *   Player bookings are rows from the database, passed in. `deskDay` stays a
 *   pure function of a `DeskSource` so the page, the API route and any test
 *   can all render the same day from the same input; `loadDesk` in
 *   src/lib/admin/load.ts is the one place that goes to Postgres for it.
 */

import type { Reading } from '@/components/admin/ui';
import type { Block } from '../blocks';
import type { DeskBooking } from '../bookings';
import { COURTS, lastPlay } from '../availability';
import { classKey, classesOn } from '../schedule';
import { CLOSE_MIN, DURATIONS, DUSK_MIN, OPEN_MIN, fmtTime24, overlaps, weekdayOf } from '../time';

/** What a block on the timeline is, which decides how it is painted. */
export type EntryKind =
  /** A player has hired the court and paid, or will pay at the court. */
  | 'hire'
  /** Held, not yet confirmed — the only kind that needs the operator. */
  | 'hold'
  /** A club class or clinic, from the weekly schedule. */
  | 'class'
  /** The club has taken the court off the market — rain, resurfacing, a tie. */
  | 'closed'
  /** Past dusk on the court with no floodlights. */
  | 'dark';

export type Entry = {
  id: string;
  court: number;
  /** Minutes from local midnight. */
  start: number;
  end: number;
  kind: EntryKind;
  title: string;
  /** Second line. Empty for the label-only blocks. */
  detail: string;
  /** Right-hand pill, e.g. "6:12 LEFT". */
  badge?: string;
  /** Set on 'hire' and 'hold' — the row this block came from, so it can be acted on. */
  bookingId?: string;
  /** Set on 'closed' — the closure this block came from, so it can be lifted. */
  blockId?: number;
  /** Unpaid and already played: the desk still has money to collect. */
  owing?: boolean;
};

export type Arrival = {
  id: string;
  start: number;
  name: string;
  detail: string;
  court: number;
  /** Their session has already finished — the row reads as history. */
  past: boolean;
  /** Still an unconfirmed hold. */
  holding: boolean;
  bookingId: string;
  phone: string;
  /** Settled up. Drives the "to pay" affordance on the row. */
  paid: boolean;
  /** Confirmed rather than still holding — a hold cannot be marked paid. */
  confirmed: boolean;
};

/** The four figures along the top of the desk. See `Readings` in admin/ui. */
export type Stat = Reading;

export type DayBar = { label: string; hours: number; today: boolean };

export type Desk = {
  date: string;
  /** Minutes from local midnight. Drives the now-line. */
  now: number;
  entries: Entry[];
  arrivals: Arrival[];
  stats: Stat[];
  week: DayBar[];
  /** True when `date` is the club’s today — the now-line depends on it. */
  isToday: boolean;
  /** The hold that needs a decision, if there is one. */
  needsYou: {
    id: string;
    name: string;
    expiresIn: string;
    line: string;
    phone: string;
  } | null;
  courts: { id: number; name: string; note: string }[];
};

/** Everything `deskDay` needs. Gathered by `loadDesk`; injected by tests. */
export type DeskSource = {
  date: string;
  /** Minutes from local midnight. */
  now: number;
  /** Wall clock, for counting holds down. */
  epochMs: number;
  /** Live bookings on `date`, in start order. */
  bookings: DeskBooking[];
  /** Court closures on `date`. */
  blocks: Block[];
  /** Whether `date` is the club's today. */
  isToday: boolean;
  /** Court-hours sold, keyed by ISO date. Covers at least the week around `date`. */
  hoursByDay: Record<string, number>;
  /** How many are signed up to each class on `date`, keyed by `classKey`. */
  enrolments: Record<string, number>;
};

const DOW_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** The class's second line. An empty class says so rather than reading "0 booked". */
function signedUp(count = 0): string {
  return count === 0 ? 'nobody signed up yet' : `${count} booked`;
}

/** 60 -> "1 hr", 90 -> "1.5 hr" */
function fmtDuration(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
}

/** Milliseconds left on a hold -> "6:12". Never counts below zero. */
function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * A sum of shillings, short enough to sit in a reading.
 *
 * Whole thousands lose their zeros, which is what the club's prices are. Any
 * other sum keeps a decimal rather than rounding money out of sight, and one
 * below a thousand — nothing taken yet, or a part payment — is printed in
 * full: "0k" is not a figure anybody recognises.
 */
function fmtMoney(amount: number): string {
  if (amount < 1000) return String(amount);
  const thousands = amount / 1000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
}

/** "06:30–07:30" */
function fmtSpan(start: number, end: number): string {
  return `${fmtTime24(start)}–${fmtTime24(end)}`;
}

/** Monday of the week containing `isoDate`, as an ISO date. */
export function weekStart(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  // getUTCDay is 0 = Sunday; shift so Monday is the start of the week.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** The seven ISO dates of the week containing `isoDate`, Monday first. */
export function weekDates(isoDate: string): string[] {
  const monday = new Date(`${weekStart(isoDate)}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** Everything on both courts for `src.date`, ready to render. */
export function deskDay(src: DeskSource): Desk {
  const { date, now, epochMs, bookings, blocks, enrolments } = src;
  const weekday = weekdayOf(date);
  const classes = classesOn(weekday);
  const entries: Entry[] = [];

  // Club classes. A clinic pushed onto court 2 by an overlapping court-1
  // lesson is worth saying out loud — the operator will otherwise wonder why
  // it is not where the printed schedule puts it.
  for (const [i, c] of classes.entries()) {
    const displaced =
      c.court !== 1 &&
      classes.some(
        (other) => other.court === 1 && overlaps(c.start, c.end, other.start, other.end),
      );

    entries.push({
      id: `class-${i}`,
      court: c.court,
      start: c.start,
      end: c.end,
      kind: 'class',
      title: c.name,
      detail: [fmtSpan(c.start, c.end), c.age, signedUp(enrolments[classKey(c.court, c.start)])]
        .filter(Boolean)
        .join(' · '),
      badge: displaced ? 'MOVED OFF CT 1' : undefined,
    });
  }

  // Closures the club has drawn over the day. A closure covering every court
  // is one row in the table and one block on each track.
  for (const b of blocks) {
    const courts = b.court_id == null ? COURTS.map((c) => c.id) : [b.court_id];
    for (const court of courts) {
      entries.push({
        id: `closure-${b.id}-${court}`,
        blockId: b.id,
        court,
        start: b.start_min,
        end: b.end_min,
        kind: 'closed',
        title: (b.reason || 'Closed').toUpperCase(),
        detail: fmtSpan(b.start_min, b.end_min),
      });
    }
  }

  // Dusk on the court without floodlights. Not a booking — a fact about the
  // court, and the reason its column ends early.
  for (const court of COURTS) {
    const last = lastPlay(court.id);
    if (last >= CLOSE_MIN) continue;
    entries.push({
      id: `dark-${court.id}`,
      court: court.id,
      start: last,
      end: CLOSE_MIN,
      kind: 'dark',
      title: `DARK FROM ${fmtTime24(last)} · NO FLOODLIGHTS`,
      detail: '',
    });
  }

  for (const b of bookings) {
    const holding = b.status === 'held';
    const duration = b.end_min - b.start_min;
    const left = holding && b.expires_at !== null ? fmtCountdown(b.expires_at - epochMs) : null;

    entries.push({
      id: `booking-${b.id}`,
      bookingId: b.id,
      court: b.court_id,
      start: b.start_min,
      end: b.end_min,
      kind: holding ? 'hold' : 'hire',
      title: b.name,
      detail: holding
        ? `${fmtSpan(b.start_min, b.end_min)} · holding`
        : [
            fmtSpan(b.start_min, b.end_min),
            fmtDuration(duration),
            b.notes || (b.paid ? 'paid' : 'to pay'),
          ].join(' · '),
      badge: left ? `${left} LEFT` : !holding && !b.paid && b.end_min <= now ? 'TO PAY' : undefined,
      owing: !holding && !b.paid,
    });
  }

  const arrivals: Arrival[] = bookings.map((b) => {
    const past = b.end_min <= now;
    const holding = b.status === 'held';
    return {
      id: `arrival-${b.id}`,
      bookingId: b.id,
      start: b.start_min,
      name: b.name,
      phone: b.phone,
      detail: holding
        ? `holding · ${b.expires_at ? fmtCountdown(b.expires_at - epochMs) : '0:00'} left`
        : past
          ? `played · ${fmtDuration(b.end_min - b.start_min)}`
          : // A walk-in may have given no number, and an empty one must not
            // leave the row opening on a separator.
            [b.phone, fmtDuration(b.end_min - b.start_min)].filter(Boolean).join(' · '),
      court: b.court_id,
      past,
      holding,
      paid: b.paid,
      confirmed: b.status === 'confirmed',
    };
  });

  const holds = bookings.filter((b) => b.status === 'held');
  // The hold nearest to lapsing is the one the operator has to deal with.
  const hold = holds
    .slice()
    .sort((a, b) => (a.expires_at ?? Infinity) - (b.expires_at ?? Infinity))[0];

  // Hours sold today, and what is still owed.
  const soldMinutes = bookings.reduce((sum, b) => sum + (b.end_min - b.start_min), 0);
  const owed = bookings.filter((b) => !b.paid && b.status === 'confirmed').length;
  const taken = bookings.filter((b) => b.paid).reduce((sum, b) => sum + b.amount, 0);

  // The first minute both courts are free, from now on.
  const nextFree = findNextFree(entries, now);

  const stats: Stat[] = [
    {
      label: 'Booked today',
      value: String(Number((soldMinutes / 60).toFixed(1))),
      detail: `hours · ${bookings.length} player${bookings.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Holds expiring',
      value: String(holds.length),
      detail: hold
        ? `${hold.name} · ${hold.expires_at ? fmtCountdown(hold.expires_at - epochMs) : '0:00'} left`
        : 'nothing waiting',
      accent: holds.length > 0,
    },
    {
      label: 'Next free',
      // A court that is free this minute reads as free this minute. Printing
      // the clock time instead ("15:03") looks like an appointment.
      value: nextFree === null ? '—' : nextFree.start <= now ? 'Now' : fmtTime24(nextFree.start),
      detail:
        nextFree === null
          ? 'nothing left today'
          : nextFree.courts.length === COURTS.length
            ? 'both courts'
            : `court ${nextFree.courts[0]}`,
    },
    {
      label: 'Taken today',
      value: fmtMoney(taken),
      detail: `TSh · ${owed} still to pay`,
    },
  ];

  const week: DayBar[] = weekDates(date).map((iso) => ({
    label: DOW_LABELS[weekdayOf(iso)],
    hours: src.hoursByDay[iso] ?? 0,
    today: iso === date,
  }));

  return {
    date,
    now,
    isToday: src.isToday,
    entries,
    arrivals,
    stats,
    week,
    needsYou: hold
      ? {
          id: hold.id,
          name: hold.name,
          expiresIn: hold.expires_at ? fmtCountdown(hold.expires_at - epochMs) : '0:00',
          line: [
            `Court ${hold.court_id}`,
            fmtSpan(hold.start_min, hold.end_min),
            fmtDuration(hold.end_min - hold.start_min),
            hold.amount.toLocaleString('en-US'),
          ].join(' · '),
          phone: hold.phone,
        }
      : null,
    courts: COURTS.map((c) => ({
      id: c.id,
      name: `Court ${c.id}`,
      note: c.floodlit
        ? `FLOODLIT · TO ${fmtTime24(CLOSE_MIN)}`
        : `NO LIGHTS · TO ${fmtTime24(DUSK_MIN)}`,
    })),
  };
}

/**
 * When a court next comes free, at or after `from`, and which courts they are.
 *
 * Two things this has to get right, both of which cost the club a booking
 * when it does not:
 *
 *   `from` is itself a candidate. A court standing empty at 15:03 is free at
 *   15:03; rounding up to the next half hour told the desk to turn away a
 *   player already at the counter. Only the times *after* now fall back to
 *   the half-hour grid, because that is what the booking form offers.
 *
 *   One free court is enough. Court 2 has no floodlights, so insisting both
 *   were free made the desk report "nothing left today" from a quarter to six
 *   every evening, while court 1 was bookable for another three hours.
 *
 * The window tested is the shortest session the club sells: a gap too short
 * to book is not a court coming free.
 *
 * Walks the grid rather than merging intervals — 30 steps, and it reads.
 */
function findNextFree(
  entries: Entry[],
  from: number,
): { start: number; courts: number[] } | null {
  const session = Math.min(...DURATIONS);

  for (const t of startTimes(Math.max(OPEN_MIN, from))) {
    const free = COURTS.filter((court) => {
      if (t + session > lastPlay(court.id)) return false;
      return !entries.some(
        (e) =>
          e.court === court.id && e.kind !== 'dark' && overlaps(t, t + session, e.start, e.end),
      );
    });
    if (free.length > 0) return { start: t, courts: free.map((c) => c.id) };
  }
  return null;
}

/** `from`, then every half-hour step after it, to close of play. */
function* startTimes(from: number): Generator<number> {
  yield from;
  for (let t = Math.floor(from / 30) * 30 + 30; t < CLOSE_MIN; t += 30) yield t;
}

export type CourtStatus = { name: string; status: string; free: boolean };

/** The fields `pencilIn` needs off the add-a-booking form. */
export type PencilInput = {
  court: number;
  start: number;
  duration: number;
  name: string;
  paid?: boolean;
};

/**
 * A booking the desk has just taken, drawn on the day before the server has
 * answered.
 *
 * The board is read at arm's length while a player stands at the counter, so
 * the block has to appear under the operator's hand rather than a round trip
 * later. It carries no `bookingId`: until the row exists there is nothing to
 * act on, so the block ignores clicks. The strip of figures along the top is
 * left alone as well — those count what the database holds, and guessing at
 * them would put two different stories on one screen for the second it takes
 * the refetch to land.
 */
export function pencilIn(day: Desk, input: PencilInput): Desk {
  const end = Math.min(input.start + input.duration, CLOSE_MIN);

  const entry: Entry = {
    id: `pending-${input.court}-${input.start}`,
    court: input.court,
    start: input.start,
    end,
    kind: 'hire',
    title: input.name,
    detail: [
      fmtSpan(input.start, end),
      fmtDuration(end - input.start),
      input.paid ? 'paid' : 'to pay',
    ].join(' · '),
    badge: 'SAVING',
    owing: !input.paid,
  };

  return { ...day, entries: [...day.entries, entry] };
}

/** What the sidebar says about each court right now. */
export function courtStatus(desk: Desk): CourtStatus[] {
  return COURTS.map((court) => {
    const busy = desk.entries.find(
      (e) => e.court === court.id && e.kind !== 'dark' && e.start <= desk.now && e.end > desk.now,
    );
    return {
      name: `Court ${court.id}`,
      status: busy ? `in play to ${fmtTime24(busy.end)}` : 'free',
      free: !busy,
    };
  });
}
