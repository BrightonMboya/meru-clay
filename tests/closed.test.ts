import { beforeEach, describe, expect, it } from 'vitest';
import { GET as availability } from '@/app/api/availability/route';
import { POST as book } from '@/app/api/bookings/route';
import { freeSlots, occupancy } from '@/lib/availability';
import { closedOn } from '@/lib/schedule';
import { addDays, nowLocal, weekdayOf } from '@/lib/time';
import { post, reset } from './helpers';

beforeEach(reset);

/** The next Monday at the club, tomorrow at the earliest. */
function nextMonday() {
  let d = addDays(nowLocal().date, 1);
  while (weekdayOf(d) !== 1) d = addDays(d, 1);
  return d;
}

describe('Monday maintenance', () => {
  it('is the one day the courts are shut every week', () => {
    expect(closedOn(1)).toBe('Maintenance');
    for (const weekday of [0, 2, 3, 4, 5, 6]) expect(closedOn(weekday)).toBeNull();
  });

  it('leaves nothing free on a Monday, on either court, at any length', () => {
    const monday = nextMonday();
    for (const duration of [60, 90] as const) {
      expect(freeSlots(duration, occupancy(monday, []))).toEqual([]);
    }
  });

  it('offers nothing on /book for a Monday', async () => {
    const res = await availability(
      new Request(`http://test/api/availability?date=${nextMonday()}&duration=60`),
    );
    const body = (await res.json()) as { slots: unknown[] };
    expect(body.slots).toEqual([]);
  });

  it('refuses a Monday booking sent straight to the API', async () => {
    const res = await book(
      post('/api/bookings', {
        court: 1,
        date: nextMonday(),
        start: 10 * 60,
        duration: 60,
        name: 'Asha Mollel',
        phone: '0712 345 678',
      }),
    );
    expect(res.status).toBe(409);
  });
});
