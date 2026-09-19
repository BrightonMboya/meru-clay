import 'server-only';

import { cache } from 'react';
import { deskBlocks } from '../blocks';
import { deskBookings, hoursByDate } from '../bookings';
import { enrolmentCounts } from '../enrolments';
import { lastAttendedByPlayer } from '../attendance';
import { bookedBetween, lastPlayedByPhone, listCoaches, listPlayers } from '../players';
import { initialsOf } from '../roster';
import { addDays, isValidDate, nowLocal } from '../time';
import { deskDay, weekDates, type Desk } from './desk';
import { buildRoster, type Roster } from './players';

/**
 * The court desk for one day, from the database.
 *
 * The only place the desk touches Postgres. `deskDay` stays pure and does the
 * arranging; this fetches what it cannot derive — the day's rows, the week's
 * totals and the class registers — in one round trip each.
 *
 * `date` defaults to today at the club, not on the server's clock or the
 * operator's device: see the note at the top of src/lib/time.ts.
 *
 * Wrapped in React's `cache`, so the admin layout and the page it wraps —
 * which both need the day — share one set of queries per request.
 */
export const loadDesk = cache(async (date?: string): Promise<Desk> => {
  const clock = nowLocal();
  const day = date && isValidDate(date) ? date : clock.date;
  const week = weekDates(day);

  const [bookings, blocks, hoursByDay, enrolments] = await Promise.all([
    deskBookings(day, clock.epochMs),
    deskBlocks(day),
    hoursByDate(week[0], week[6]),
    enrolmentCounts(day),
  ]);

  const isToday = day === clock.date;

  return deskDay({
    date: day,
    // The now-line only means anything on today; on any other day it sits at
    // opening time rather than pretending the club is mid-afternoon.
    now: isToday ? clock.minutes : 0,
    isToday,
    epochMs: clock.epochMs,
    bookings,
    blocks,
    hoursByDay,
    enrolments,
  });
});

/**
 * The club roster, from the database.
 *
 * Three queries and a pure arrangement, the same division `loadDesk` makes:
 * `listPlayers` fetches the rows, the other two fetch the facts about them
 * that live in the bookings table — when they last played, and whether they
 * already have a court this week — and `buildRoster` counts everything the
 * screen shows. Nothing on the roster is a stored total.
 *
 * Request-memoised like the desk, so a page and the route handler behind its
 * refresh do not ask twice.
 */
export const loadRoster = cache(async (): Promise<Roster> => {
  const today = nowLocal().date;
  const [rows, lastPlayed, attended, bookedThisWeek] = await Promise.all([
    listPlayers(),
    lastPlayedByPhone(today),
    lastAttendedByPlayer(today),
    // Today plus six is seven days inclusive — the week the rail speaks for.
    bookedBetween(today, addDays(today, 6)),
  ]);
  return buildRoster({ today, rows, lastPlayed, attended, bookedThisWeek });
});

/**
 * Who is at the desk, for the shell's operator row.
 *
 * The first coach on the roster, alphabetically. The shell used to name a
 * hard-coded "Elias Kimaro"; until there is a sign-in, the club's own coach
 * list is a truer answer than an invented one. Falls back to the club itself
 * rather than an empty row on a database with no coaches in it yet.
 */
export const loadOperator = cache(async () => {
  const [coach] = await listCoaches();
  if (!coach) return { initials: 'MC', name: 'Meru Clay', role: 'Club office' };
  return { initials: initialsOf(coach.name), name: coach.name, role: 'Coach' };
});
