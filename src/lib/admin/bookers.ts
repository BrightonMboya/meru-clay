/**
 * Everybody who has booked, as the Players screen reads them.
 *
 * Pure, like src/lib/admin/players.ts: it takes the visits
 * `listVisits` fetched and the numbers on the members roster, and counts.
 * Nothing here is stored, so nothing here can drift from the court sheet.
 *
 * A person is a phone number. That is the only thing a booking and a class
 * place share — /book takes a name and a number from whoever turns up — so it
 * is the join. A walk-in the desk took with no number falls back to their
 * name, which is the best the record can do.
 *
 * One consequence worth knowing: a parent who books trials for two children
 * on their own number is one row here, under the most recent name used.
 */

import { fmtTsh } from '@/lib/pricing';
import { initialsOf } from '@/lib/roster';
import { fmtDayLabel } from '@/lib/time';
import type { Visit } from '@/lib/players';
import { sincePlayed } from './players';

/** One row of the Players table. */
export type Booker = {
  key: string;
  initials: string;
  /** The most recent name they booked under. */
  name: string;
  /** E.164, or '' for a walk-in with no number. */
  phone: string;
  /** Visits already over: courts and classes. */
  played: number;
  courts: number;
  classes: number;
  /** Court time already played, in hours. Classes are not counted. */
  hours: number;
  /** "2 days ago", or 'Not yet' for somebody whose only booking is ahead. */
  lastPlayed: string;
  /** ISO date of the last visit, for sorting. Null until they have played. */
  lastPlayedOn: string | null;
  /** "Sat 8 Nov", or null when nothing is booked. */
  next: string | null;
  /** Shillings paid across every visit. */
  spent: string;
  /** "since Sep 2026" — when they first booked. */
  since: string;
  /** Their number is on the members roster. */
  member: boolean;
};

export type Bookers = {
  today: string;
  people: Booker[];
  readings: {
    people: number;
    visits: number;
    /** People who have played more than once. */
    returning: number;
    /** People who played in the current calendar month. */
    thisMonth: number;
    /** People with something booked from now on. */
    upcoming: number;
  };
};

export type BookersInput = {
  today: string;
  /** Minutes from midnight at the club, so a booking at 18:00 is not yet played at 17:00. */
  minutes: number;
  visits: Visit[];
  /** Phone numbers on the members roster. */
  memberPhones: Set<string>;
};

/** A class has no end on its row; an hour is how long the timetable runs one. */
const CLASS_MINUTES = 60;

export function buildBookers({ today, minutes, visits, memberPhones }: BookersInput): Bookers {
  type Tally = {
    name: string;
    phone: string;
    first: string;
    courts: number;
    classes: number;
    playedMinutes: number;
    last: string | null;
    next: string | null;
    spent: number;
  };

  const byKey = new Map<string, Tally>();

  // `visits` arrives oldest first, so each later row's name overwrites the
  // last — the row ends up under the name they most recently gave.
  for (const v of visits) {
    const key = v.phone || `name:${v.name.trim().toLowerCase()}`;
    const t = byKey.get(key) ?? {
      name: v.name,
      phone: v.phone,
      first: v.date,
      courts: 0,
      classes: 0,
      playedMinutes: 0,
      last: null,
      next: null,
      spent: 0,
    };
    t.name = v.name.trim() || t.name;
    t.spent += v.paid;

    const end = v.endMin ?? v.startMin + CLASS_MINUTES;
    const over = v.date < today || (v.date === today && end <= minutes);

    if (over) {
      if (v.kind === 'court') {
        t.courts += 1;
        t.playedMinutes += end - v.startMin;
      } else {
        t.classes += 1;
      }
      t.last = v.date;
    } else if (t.next === null) {
      // Oldest first, so the first one still ahead is the soonest.
      t.next = v.date;
    }

    byKey.set(key, t);
  }

  const people: Booker[] = [...byKey.entries()].map(([key, t]) => {
    const next = t.next ? fmtDayLabel(t.next) : null;
    const since = fmtDayLabel(t.first);
    return {
      key,
      initials: initialsOf(t.name),
      name: t.name,
      phone: t.phone,
      played: t.courts + t.classes,
      courts: t.courts,
      classes: t.classes,
      hours: Math.round((t.playedMinutes / 60) * 10) / 10,
      lastPlayed: sincePlayed(t.last ?? undefined, today),
      lastPlayedOn: t.last,
      next: next ? `${next.dow} ${next.day} ${next.mon}` : null,
      spent: t.spent > 0 ? `TSh ${fmtTsh(t.spent)}` : '—',
      since: `since ${since.mon} ${t.first.slice(0, 4)}`,
      member: t.phone !== '' && memberPhones.has(t.phone),
    };
  });

  // Most played first; among equals, whoever was on court most recently.
  people.sort(
    (a, b) =>
      b.played - a.played ||
      (b.lastPlayedOn ?? '').localeCompare(a.lastPlayedOn ?? '') ||
      a.name.localeCompare(b.name),
  );

  const month = today.slice(0, 7);

  return {
    today,
    people,
    readings: {
      people: people.length,
      visits: people.reduce((sum, p) => sum + p.played, 0),
      returning: people.filter((p) => p.played > 1).length,
      thisMonth: people.filter((p) => p.lastPlayedOn?.slice(0, 7) === month).length,
      upcoming: people.filter((p) => p.next !== null).length,
    },
  };
}

/**
 * Name or number, the same rule as the roster's search: numbers are stored
 * E.164 and typed at the desk the local way, so both spellings are tried.
 */
export function matchesBooker(person: Booker, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/[\s-]/g, '');
  if (!q) return true;
  if (person.name.toLowerCase().replace(/\s/g, '').includes(q)) return true;
  if (!person.phone) return false;
  const local = person.phone.replace(/^\+255/, '0');
  return person.phone.includes(q) || local.includes(q);
}
