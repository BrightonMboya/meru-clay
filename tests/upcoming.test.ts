import { describe, expect, it } from 'vitest';
import { buildUpcoming } from '@/lib/admin/upcoming';
import type { DeskBooking } from '@/lib/bookings';
import type { TrialForCoach } from '@/lib/trial';

// 2026-11-05 is a Thursday; the 9th is the Monday the courts are shut and
// the 6th is Friday, with social tennis on court A from 18:30.
const today = '2026-11-05';

function booking(over: Partial<DeskBooking>): DeskBooking {
  return {
    id: 'b1',
    court_id: 1,
    date: today,
    start_min: 16 * 60,
    end_min: 17 * 60,
    name: 'Juma Said',
    phone: '+255712111222',
    email: null,
    coach: 0,
    status: 'confirmed',
    notes: null,
    paid: true,
    amount: 30_000,
    expires_at: null,
    created_at: 0,
    ...over,
  };
}

const trial: TrialForCoach = {
  id: 1,
  leadId: 1,
  bookingId: 'b2',
  date: '2026-11-06',
  startMin: 10 * 60,
  player: 'child',
  childName: 'Neema',
  childAge: 8,
  level: 'never',
  notes: 'Mild asthma, has an inhaler.',
  createdAt: new Date(),
  parentName: 'Amina Mushi',
};

describe('buildUpcoming', () => {
  const up = buildUpcoming({
    today,
    nowMin: 16 * 60 + 30,
    bookings: [
      booking({ id: 'b0', start_min: 9 * 60, end_min: 10 * 60 }),
      booking({}),
      booking({
        id: 'b2',
        date: '2026-11-06',
        start_min: 10 * 60,
        end_min: 11 * 60,
        paid: false,
        amount: 15_000,
      }),
    ],
    trials: [trial],
    enrolments: [
      {
        id: 1,
        date: '2026-11-06',
        court: 1,
        start: 18 * 60 + 30,
        className: 'Social tennis',
        name: 'Rehema',
        phone: '+255700000001',
        amount: 0,
        paid: true,
      },
    ],
  });

  it('drops what is already over today and marks what is on court now', () => {
    const [day] = up.days;
    expect(day.label).toBe('Today');
    expect(day.sessions.map((s) => s.id)).toEqual(['b1']);
    expect(day.sessions[0]).toMatchObject({ live: true, toCollect: 0, kind: 'hire' });
  });

  it('shows a trial as the child, with the parent, level, notes and cash to collect', () => {
    const fri = up.days[1];
    expect(fri.label).toBe('Tomorrow');
    expect(fri.sessions[0]).toMatchObject({
      kind: 'trial',
      who: 'Neema, 8',
      sub: 'Parent: Amina Mushi',
      level: 'Never played',
      notes: 'Mild asthma, has an inhaler.',
      toCollect: 15_000,
    });
  });

  it('lists a class with its register, and says when the courts are shut', () => {
    const fri = up.days[1];
    expect(fri.sessions[1]).toMatchObject({ kind: 'class', who: 'Social tennis', roll: ['Rehema'] });
    expect(up.days.find((d) => d.date === '2026-11-09')?.closed).toBe('Maintenance');
    expect(up.totals).toEqual({ sessions: 3, trials: 1, toCollect: 15_000 });
  });
});
