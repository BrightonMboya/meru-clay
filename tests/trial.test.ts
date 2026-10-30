import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as trial } from '@/app/api/trial/route';
import { db } from '@/lib/db/client';
import { bookings, leads, payments, trials } from '@/lib/db/schema';
import { freeSlots, makeLead, post, reset } from './helpers';

beforeEach(reset);

type Json = Record<string, unknown>;
const body = async (res: Response) => (await res.json()) as Json;

const kid = {
  player: 'child',
  childName: 'Neema',
  childAge: 8,
  name: 'Amina Mushi',
  phone: '0754 000 111',
  level: 'never',
  notes: 'Mild asthma, has an inhaler.',
};

describe('POST /api/trial', () => {
  it('books a free kids trial on a court, with no payment, and records the child', async () => {
    const [slot] = await freeSlots();
    const res = await trial(post('/api/trial', { ...kid, date: slot.date, start: slot.start }));
    expect(res.status).toBe(201);
    const { id } = await body(res);

    const [t] = await db.select().from(trials).where(eq(trials.id, id as number));
    expect(t).toMatchObject({
      date: slot.date,
      startMin: slot.start,
      player: 'child',
      childName: 'Neema',
      childAge: 8,
      level: 'never',
      notes: 'Mild asthma, has an inhaler.',
    });

    const [b] = await db.select().from(bookings).where(eq(bookings.id, t.bookingId!));
    expect(b).toMatchObject({ status: 'confirmed', paid: true, amount: 0, coach: false, phone: '+255754000111' });
    expect(b.notes).toContain('age 8');

    const [lead] = await db.select().from(leads);
    expect(lead).toMatchObject({ name: 'Amina Mushi', stage: 'trial_booked' });
    expect(await db.select().from(payments)).toEqual([]);
  });

  it('books an adult without any child details', async () => {
    const [slot] = await freeSlots();
    const res = await trial(
      post('/api/trial', {
        player: 'adult',
        name: 'Juma Said',
        phone: '0712 111 222',
        level: 'some',
        date: slot.date,
        start: slot.start,
      }),
    );
    expect(res.status).toBe(201);
    const [t] = await db.select().from(trials);
    expect(t).toMatchObject({ player: 'adult', childName: null, childAge: null, level: 'some' });
  });

  it('asks for the child’s name and an age in range', async () => {
    const [slot] = await freeSlots();
    const at = { date: slot.date, start: slot.start };
    expect((await trial(post('/api/trial', { ...kid, ...at, childName: '' }))).status).toBe(400);
    expect((await trial(post('/api/trial', { ...kid, ...at, childAge: 2 }))).status).toBe(400);
    expect((await trial(post('/api/trial', { ...kid, ...at, childAge: 18 }))).status).toBe(400);
    expect(await db.select().from(bookings)).toEqual([]);
  });

  it('treats the same form sent twice as one trial on one court', async () => {
    const [slot] = await freeSlots();
    const form = { ...kid, date: slot.date, start: slot.start };
    const first = await body(await trial(post('/api/trial', form)));
    const again = await trial(post('/api/trial', form));
    expect(again.status).toBe(200);
    expect((await body(again)).id).toBe(first.id);
    expect(await db.select().from(bookings)).toHaveLength(1);
  });

  it('lets a parent book a second child, on the same lead', async () => {
    const [a, b] = await freeSlots();
    await trial(post('/api/trial', { ...kid, date: a.date, start: a.start }));
    const res = await trial(
      post('/api/trial', { ...kid, childName: 'Baraka', childAge: 6, date: b.date, start: b.start }),
    );
    expect(res.status).toBe(201);
    expect(await db.select().from(trials)).toHaveLength(2);
    expect(await db.select().from(leads)).toHaveLength(1);
  });

  it('stops one number holding more than three upcoming trials', async () => {
    const slots = await freeSlots();
    for (const [i, s] of slots.slice(0, 3).entries()) {
      const res = await trial(
        post('/api/trial', { ...kid, childName: `Kid ${i}`, date: s.date, start: s.start }),
      );
      expect(res.status).toBe(201);
    }
    const s = slots[3];
    const res = await trial(post('/api/trial', { ...kid, childName: 'Kid 4', date: s.date, start: s.start }));
    expect(res.status).toBe(429);
  });

  it('refuses a time with no court left', async () => {
    const [slot] = await freeSlots();
    // Fill every court at that start.
    for (const phone of ['0711 000 001', '0711 000 002', '0711 000 003', '0711 000 004']) {
      await trial(post('/api/trial', { ...kid, phone, date: slot.date, start: slot.start }));
    }
    const res = await trial(
      post('/api/trial', { ...kid, phone: '0711 000 009', date: slot.date, start: slot.start }),
    );
    expect(res.status).toBe(409);
  });

  it('leaves a lead further along the pipeline where it is', async () => {
    await makeLead({ phone: '+255754000111', stage: 'joined' });
    const [slot] = await freeSlots();
    await trial(post('/api/trial', { ...kid, date: slot.date, start: slot.start }));
    const [lead] = await db.select().from(leads);
    expect(lead.stage).toBe('joined');
  });
});
