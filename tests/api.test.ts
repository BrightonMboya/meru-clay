import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as book } from '@/app/api/bookings/route';
import { POST as join } from '@/app/api/join/route';
import { POST as lookup } from '@/app/api/members/lookup/route';
import { GET as viewPayment } from '@/app/api/payments/[id]/route';
import { db } from '@/lib/db/client';
import { bookings, leads, payments } from '@/lib/db/schema';
import { creditPack, packBalance } from '@/lib/packs';
import { HOLD_MINUTES } from '@/lib/time';
import { freeSlot, freeSlots, makePlayer, post, reset } from './helpers';

beforeEach(reset);

type Json = Record<string, unknown>;
const body = async (res: Response) => (await res.json()) as Json;

/* ------------------------------------------------------------------ join */

describe('POST /api/join', () => {
  const form = { name: 'Amina Juma', phone: '0754 000 111', sessions: 8, withKid: true };

  it('needs no email, and opens a payment for the pack at its price', async () => {
    const res = await join(post('/api/join', form));
    expect(res.status).toBe(201);
    const { id } = await body(res);

    const [pay] = await db.select().from(payments).where(eq(payments.id, id as string));
    expect(pay).toMatchObject({
      purpose: 'pack',
      amount: 175_000,
      sessions: 8,
      status: 'pending',
      phone: '+255754000111',
      playerId: null,
    });
    expect(pay.leadId).not.toBeNull();
  });

  it.each([
    [4, 100_000],
    [8, 175_000],
    [12, 250_000],
    [20, 350_000],
  ])('charges the right amount for %i sessions', async (sessions, amount) => {
    const { id } = await body(await join(post('/api/join', { ...form, sessions })));
    const [pay] = await db.select().from(payments).where(eq(payments.id, id as string));
    expect(pay.amount).toBe(amount);
    expect(pay.sessions).toBe(sessions);
  });

  it('ignores an amount the browser tries to set', async () => {
    const { id } = await body(await join(post('/api/join', { ...form, amount: 1 })));
    const [pay] = await db.select().from(payments).where(eq(payments.id, id as string));
    expect(pay.amount).toBe(175_000);
  });

  it('puts them on the leads board, with what they chose', async () => {
    await join(post('/api/join', form));
    const [lead] = await db.select().from(leads);
    expect(lead).toMatchObject({ name: 'Amina Juma', phone: '+255754000111', stage: 'new' });
    expect(lead.note).toMatch(/8 sessions/);
    expect(lead.note).toMatch(/child/);
  });

  it('reuses the open payment when the form is sent twice', async () => {
    const a = await body(await join(post('/api/join', form)));
    const b = await body(await join(post('/api/join', { ...form, phone: '+255754000111' })));
    expect(b.id).toBe(a.id);
    expect(await db.select().from(payments)).toHaveLength(1);
    expect(await db.select().from(leads)).toHaveLength(1);
  });

  it('opens a separate payment for a different pack', async () => {
    const a = await body(await join(post('/api/join', form)));
    const b = await body(await join(post('/api/join', { ...form, sessions: 4 })));
    expect(b.id).not.toBe(a.id);
  });

  it('treats a member already on the roster as a top-up', async () => {
    const p = await makePlayer({ phone: '+255754000111', name: 'Amina Juma' });
    const { id } = await body(await join(post('/api/join', form)));
    const [pay] = await db.select().from(payments).where(eq(payments.id, id as string));
    expect(pay.playerId).toBe(p.id);
    expect(pay.leadId).toBeNull();
    expect(await db.select().from(leads)).toHaveLength(0);
  });

  it.each([
    [{ ...form, name: 'A' }, /name/],
    [{ ...form, phone: '12345' }, /phone number/],
    [{ ...form, phone: '' }, /mobile money number/],
    [{ ...form, sessions: 16 }, /sessions/],
    [{ ...form, sessions: undefined }, /sessions/],
  ])('refuses a bad form with a reason a visitor can act on', async (bad, why) => {
    const res = await join(post('/api/join', bad));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toMatch(why);
    expect(await db.select().from(payments)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------- bookings */

describe('POST /api/bookings — paying now', () => {
  it.each([
    [60, 30_000],
    [90, 45_000],
  ])('holds the court and opens a payment for %i minutes at its price', async (duration, amount) => {
    const slot = await freeSlot(undefined, duration);
    const res = await book(
      post('/api/bookings', { ...slot, duration, name: 'Asha', phone: '0712 999 000' }),
    );
    expect(res.status).toBe(201);
    const created = await body(res);
    expect(created.paymentId).toBeTruthy();
    expect(created.left).toBeNull();

    const [b] = await db.select().from(bookings).where(eq(bookings.id, created.id as string));
    expect(b).toMatchObject({ status: 'held', paid: false, amount, packId: null });

    const [pay] = await db.select().from(payments).where(eq(payments.id, created.paymentId as string));
    expect(pay).toMatchObject({ purpose: 'booking', amount, bookingId: b.id, phone: '+255712999000' });
    // The link and the hold die together.
    const gap = pay.expiresAt!.getTime() - b.expiresAt!.getTime();
    expect(Math.abs(gap)).toBeLessThan(5_000);
    expect(pay.expiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(HOLD_MINUTES * 60_000);
  });

  it('charges the same with a coach as without', async () => {
    const slot = await freeSlot(undefined, 60, true);
    const created = await body(
      await book(post('/api/bookings', { ...slot, coach: true, name: 'Asha', phone: '0712999000' })),
    );
    const [pay] = await db.select().from(payments).where(eq(payments.id, created.paymentId as string));
    expect(pay.amount).toBe(30_000);
  });

  it('gives the slot to one payer when two go for it', async () => {
    const slot = await freeSlot();
    const [a, b] = await Promise.all([
      book(post('/api/bookings', { ...slot, name: 'Asha', phone: '0712000001' })),
      book(post('/api/bookings', { ...slot, name: 'Baraka', phone: '0712000002' })),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await db.select().from(payments)).toHaveLength(1);
  });

  it('still wants a name from a payer', async () => {
    const slot = await freeSlot();
    const res = await book(post('/api/bookings', { ...slot, phone: '0712000001' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/bookings — with a session', () => {
  async function member(sessions: number) {
    const p = await makePlayer();
    await creditPack(db, { playerId: p.id, sessions, amount: 0, paymentId: null });
    return p;
  }

  it.each(['0712345678', '712345678', '+255 712 345 678', '255712345678'])(
    'finds the member typed as %s, confirms the court, and says what is left',
    async (phone) => {
      const p = await member(8);
      const slot = await freeSlot();
      const res = await book(post('/api/bookings', { ...slot, phone, pack: true }));
      expect(res.status).toBe(201);
      const created = await body(res);
      expect(created).toMatchObject({ status: 'confirmed', paymentId: null, left: 7 });

      const [b] = await db.select().from(bookings).where(eq(bookings.id, created.id as string));
      expect(b).toMatchObject({ name: 'Tony Mushi', paid: true, amount: 0, status: 'confirmed' });
      expect(await db.select().from(payments)).toHaveLength(0);
      expect((await packBalance(p.id)).left).toBe(7);
    },
  );

  it('404s a number with no member behind it, and books nothing', async () => {
    const slot = await freeSlot();
    const res = await book(post('/api/bookings', { ...slot, phone: '0799000000', pack: true }));
    expect(res.status).toBe(404);
    expect(await db.select().from(bookings)).toHaveLength(0);
  });

  it('409s a member with nothing left, and books nothing', async () => {
    await member(1);
    const [a, b] = await freeSlots();
    expect((await book(post('/api/bookings', { ...a, phone: '0712345678', pack: true }))).status).toBe(201);
    const res = await book(post('/api/bookings', { ...b, phone: '0712345678', pack: true }));
    expect(res.status).toBe(409);
    expect((await body(res)).error).toMatch(/no sessions left/);
    expect(await db.select().from(bookings)).toHaveLength(1);
  });

  it('counts down through a whole pack', async () => {
    const p = await member(4);
    const slots = await freeSlots();
    const lefts: unknown[] = [];
    for (const s of slots.slice(0, 5)) {
      const res = await book(post('/api/bookings', { ...s, phone: '0712345678', pack: true }));
      lefts.push(res.status === 201 ? (await body(res)).left : res.status);
    }
    expect(lefts).toEqual([3, 2, 1, 0, 409]);
    expect(await packBalance(p.id)).toEqual({ bought: 4, used: 4, left: 0 });
  });
});

/* ---------------------------------------------------------------- lookup */

describe('POST /api/members/lookup', () => {
  it('finds a member however the number is typed, and says only a first name and the count', async () => {
    const p = await makePlayer({ name: 'Tony Brighton Mushi' });
    await creditPack(db, { playerId: p.id, sessions: 8, amount: 0, paymentId: null });

    for (const phone of ['0712345678', '712 345 678', '+255712345678', '00255712345678']) {
      const res = await lookup(post('/api/members/lookup', { phone }));
      expect(await body(res)).toEqual({
        found: true,
        firstName: 'Tony',
        bought: 8,
        used: 0,
        left: 8,
      });
    }
  });

  it('says not found for a stranger', async () => {
    expect(await body(await lookup(post('/api/members/lookup', { phone: '0799000000' })))).toEqual({
      found: false,
    });
  });

  it('reports a member with no pack as zero', async () => {
    await makePlayer();
    expect(await body(await lookup(post('/api/members/lookup', { phone: '0712345678' })))).toMatchObject(
      { found: true, bought: 0, left: 0 },
    );
  });

  it('does not find somebody who has left the club', async () => {
    await makePlayer({ active: false });
    expect((await body(await lookup(post('/api/members/lookup', { phone: '0712345678' })))).found).toBe(
      false,
    );
  });

  it('400s a number that is not one', async () => {
    expect((await lookup(post('/api/members/lookup', { phone: '123' }))).status).toBe(400);
  });
});

/* -------------------------------------------------------------- /pay page */

describe('GET /api/payments/:id for a pack', () => {
  it('describes the pack to the payer', async () => {
    const { id } = await body(
      await join(post('/api/join', { name: 'Amina Juma', phone: '0754000111', sessions: 20 })),
    );
    const res = await viewPayment(new Request('http://test'), {
      params: Promise.resolve({ id: id as string }),
    } as never);
    expect(await body(res)).toMatchObject({
      purpose: 'pack',
      amount: 350_000,
      title: '16–20 sessions',
      detail: 'Joining Meru Clay',
      done: false,
      pending: true,
    });
  });
});
