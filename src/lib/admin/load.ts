import 'server-only';

import { cache } from 'react';
import { deskBlocks } from '../blocks';
import { deskBookings, hoursByDate } from '../bookings';
import { isValidDate, nowLocal } from '../time';
import { deskDay, weekDates, type Desk } from './desk';

/**
 * The court desk for one day, from the database.
 *
 * The only place the desk touches Postgres. `deskDay` stays pure and does the
 * arranging; this fetches the two things it cannot derive — the day's rows and
 * the week's totals — in one round trip each.
 *
 * `date` defaults to today at the club, not on the server's clock or the
 * operator's device: see the note at the top of src/lib/time.ts.
 *
 * Wrapped in React's `cache`, so the admin layout and the page it wraps —
 * which both need the day — share one pair of queries per request.
 */
export const loadDesk = cache(async (date?: string): Promise<Desk> => {
  const clock = nowLocal();
  const day = date && isValidDate(date) ? date : clock.date;
  const week = weekDates(day);

  const [bookings, blocks, hoursByDay] = await Promise.all([
    deskBookings(day, clock.epochMs),
    deskBlocks(day),
    hoursByDate(week[0], week[6]),
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
  });
});
