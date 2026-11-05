/**
 * The coach's Upcoming screen: who is on court over the next few days.
 *
 * The court desk answers "what does one day look like, court by court?". This
 * answers the coach's question instead — "who am I seeing, and what do I need
 * to know about them?" — as one list per day, on a phone. A trial carries the
 * child's name, age, how much they have played and what the parent said the
 * coach should know; a class carries its register; anything still owed says
 * how much cash to collect.
 *
 * Pure, like `deskDay`: `loadUpcoming` in ./load.ts fetches, this arranges,
 * and tests can hand it rows directly.
 */

import { courtName } from '../availability';
import type { DeskBooking } from '../bookings';
import type { Enrolment } from '../enrolments';
import { TRIAL_LEVEL_LABELS } from '../pipeline';
import { classKey, classesOn, closedOn } from '../schedule';
import { addDays, fmtLongDay, weekdayOf } from '../time';
import type { TrialForCoach } from '../trial';

/** How many days the screen looks ahead, today included. */
export const UPCOMING_DAYS = 7;

export type UpcomingSession = {
  id: string;
  kind: 'trial' | 'hire' | 'class';
  /** Minutes from local midnight. */
  start: number;
  end: number;
  court: string;
  /** The player: the child, for a kids trial. */
  who: string;
  /** Second line — the parent, "With the coach", how many are signed up. */
  sub: string | null;
  /** How much tennis they have played. Trials only. */
  level: string | null;
  /** Anything the coach should know. */
  notes: string | null;
  /** Who to call or WhatsApp. Null for a class. */
  phone: string | null;
  /** Cash still to collect, in shillings. 0 when settled or nothing is owed. */
  toCollect: number;
  /** An unconfirmed online hold — may not turn up. */
  holding: boolean;
  coached: boolean;
  /** In play at this moment. */
  live: boolean;
  /** A class's register, in sign-up order. */
  roll: string[];
};

export type UpcomingDay = {
  date: string;
  /** "Today", "Tomorrow", or "Saturday 8 November". */
  label: string;
  /** Why the courts are shut all day, if they are. */
  closed: string | null;
  sessions: UpcomingSession[];
};

export type Upcoming = {
  days: UpcomingDay[];
  totals: { sessions: number; trials: number; toCollect: number };
};

export type UpcomingSource = {
  /** The club's today. */
  today: string;
  /** Minutes from local midnight, now. Sessions already over today are dropped. */
  nowMin: number;
  /** Live bookings across the window. */
  bookings: DeskBooking[];
  trials: TrialForCoach[];
  enrolments: Enrolment[];
  days?: number;
};

export function upcomingDates(today: string, days = UPCOMING_DAYS): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, i));
}

export function buildUpcoming(src: UpcomingSource): Upcoming {
  const trialByBooking = new Map(
    src.trials.filter((t) => t.bookingId).map((t) => [t.bookingId!, t]),
  );
  const rolls = new Map<string, string[]>();
  for (const e of src.enrolments) {
    const k = `${e.date}|${classKey(e.court, e.start)}`;
    rolls.set(k, [...(rolls.get(k) ?? []), e.name]);
  }

  const days = upcomingDates(src.today, src.days).map((date): UpcomingDay => {
    const isToday = date === src.today;
    const over = (end: number) => isToday && end <= src.nowMin;
    const live = (start: number, end: number) =>
      isToday && start <= src.nowMin && src.nowMin < end;
    const weekday = weekdayOf(date);

    const sessions: UpcomingSession[] = [];

    for (const b of src.bookings) {
      if (b.date !== date || over(b.end_min)) continue;
      const t = trialByBooking.get(b.id);
      const base = {
        id: b.id,
        start: b.start_min,
        end: b.end_min,
        court: courtName(b.court_id),
        phone: b.phone,
        toCollect: b.status === 'confirmed' && !b.paid ? b.amount : 0,
        holding: b.status === 'held',
        live: live(b.start_min, b.end_min),
        roll: [],
      };
      if (t) {
        const child = t.player === 'child';
        sessions.push({
          ...base,
          kind: 'trial',
          who: child ? `${t.childName}, ${t.childAge}` : t.parentName,
          sub: child ? `Parent: ${t.parentName}` : 'Adult',
          level: TRIAL_LEVEL_LABELS[t.level],
          notes: t.notes,
          coached: true,
        });
      } else {
        sessions.push({
          ...base,
          kind: 'hire',
          who: b.name,
          sub: b.coach ? 'With the coach' : 'Court hire',
          level: null,
          notes: b.notes,
          coached: Boolean(b.coach),
        });
      }
    }

    for (const c of classesOn(weekday)) {
      if (over(c.end)) continue;
      const roll = rolls.get(`${date}|${classKey(c.court, c.start)}`) ?? [];
      sessions.push({
        id: `class-${date}-${c.court}-${c.start}`,
        kind: 'class',
        start: c.start,
        end: c.end,
        court: courtName(c.court),
        who: c.name,
        sub: roll.length ? `${roll.length} signed up` : 'Nobody signed up yet',
        level: c.age ?? null,
        notes: null,
        phone: null,
        toCollect: 0,
        holding: false,
        coached: true,
        live: live(c.start, c.end),
        roll,
      });
    }

    sessions.sort((a, b) => a.start - b.start || a.court.localeCompare(b.court));

    return {
      date,
      label: isToday ? 'Today' : date === addDays(src.today, 1) ? 'Tomorrow' : fmtLongDay(date),
      closed: closedOn(weekday),
      sessions,
    };
  });

  const all = days.flatMap((d) => d.sessions);
  return {
    days,
    totals: {
      sessions: all.length,
      trials: all.filter((s) => s.kind === 'trial').length,
      toCollect: all.reduce((sum, s) => sum + s.toCollect, 0),
    },
  };
}
