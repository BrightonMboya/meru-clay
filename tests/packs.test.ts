import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelBooking, cancelOwnBooking, createBooking } from '@/lib/bookings';
import { db } from '@/lib/db/client';
import { bookings, payments } from '@/lib/db/schema';
import { creditPack, packBalance, packBalances } from '@/lib/packs';
import { nowLocal } from '@/lib/time';
import { freeSlots, makePlayer, pgError, reset, tomorrow } from './helpers';

beforeEach(reset);

const now = () => nowLocal().epochMs;

async function bookWithPack(playerId: number, slot: { court: number; date: string; start: number }) {
  return createBooking(
    {
      court: slot.court,
      date: slot.date,
      start: slot.start,
      duration: 60,
      name: 'Tony Mushi',
      phone: '+255712345678',
      packPlayerId: playerId,
    },
    now(),
  );
}

describe('pack balance', () => {
  it('is zero for somebody who never bought one', async () => {
    const p = await makePlayer();
    expect(await packBalance(p.id)).toEqual({ bought: 0, used: 0, left: 0 });
    expect((await packBalances()).has(p.id)).toBe(false);
  });

  it('adds packs together', async () => {
    const p = await makePlayer();
    await creditPack(db, { playerId: p.id, sessions: 8, amount: 175_000, paymentId: null });
    await creditPack(db, { playerId: p.id, sessions: 4, amount: 100_000, paymentId: null });
    expect(await packBalance(p.id)).toEqual({ bought: 12, used: 0, left: 12 });
  });

  it('keeps members apart', async () => {
    const a = await makePlayer();
    const b = await makePlayer({ name: 'Other', phone: '+255713000000' });
    await creditPack(db, { playerId: a.id, sessions: 8, amount: 0, paymentId: null });
    await creditPack(db, { playerId: b.id, sessions: 4, amount: 0, paymentId: null });
    const [slot] = await freeSlots();
    expect((await bookWithPack(a.id, slot)).ok).toBe(true);

    const all = await packBalances();
    expect(all.get(a.id)).toEqual({ bought: 8, used: 1, left: 7 });
    expect(all.get(b.id)).toEqual({ bought: 4, used: 0, left: 4 });
  });
});

describe('booking with a session', () => {
  it('confirms, marks paid, costs nothing, and spends one session', async () => {
    const p = await makePlayer();
    await creditPack(db, { playerId: p.id, sessions: 8, amount: 175_000, paymentId: null });
    const [slot] = await freeSlots();

    const result = await bookWithPack(p.id, slot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await db.select().from(bookings).where(eq(bookings.id, result.booking.id));
    expect(row.status).toBe('confirmed');
    expect(row.paid).toBe(true);
    expect(row.amount).toBe(0);
    expect(row.expiresAt).toBeNull();
    expect(row.packId).not.toBeNull();
    expect(await packBalance(p.id)).toEqual({ bought: 8, used: 1, left: 7 });
  });

  it('opens no payment', async () => {
    const p = await makePlayer();
    await creditPack(db, { playerId: p.id, sessions: 4, amount: 0, paymentId: null });
    const [slot] = await freeSlots();
    await bookWithPack(p.id, slot);
    expect(await db.select().from(payments)).toHaveLength(0);
  });

  it('refuses with no-sessions once they are used up, and writes nothing', async () => {
    const p = await makePlayer();
    await creditPack(db, { playerId: p.id, sessions: 1, amount: 0, paymentId: null });
    const [a, b] = await freeSlots();
    expect((await bookWithPack(p.id, a)).ok).toBe(true);

    const second = await bookWithPack(p.id, b);
    expect(second).toEqual({ ok: false, reason: 'no-sessions' });
    expect(await db.select().from(bookings)).toHaveLength(1);
  });

  it('refuses somebody who never bought a pack', async () => {
    const p = await makePlayer();
    const [slot] = await freeSlots();
    expect(await bookWithPack(p.id, slot)).toEqual({ ok: false, reason: 'no-sessions' });
  });

  it('spends the oldest pack first, then the next', async () => {
    const p = await makePlayer();
    await creditPack(db, { playerId: p.id, sessions: 1, amount: 0, paymentId: null });
    await creditPack(db, { playerId: p.id, sessions: 4, amount: 0, paymentId: null });
    const [a, b] = await freeSlots();

    const first = await bookWithPack(p.id, a);
    const second = await bookWithPack(p.id, b);
    const ids = await db
      .select({ pack: bookings.packId })
      .from(bookings)
      .orderBy(bookings.createdAt);
    expect(first.ok && second.ok).toBe(true);
    expect(ids[0].pack).not.toBe(ids[1].pack);
    expect(await packBalance(p.id)).toEqual({ bought: 5, used: 2, left: 3 });
  });

  it('still loses to somebody already on that court, and spends nothing', async () => {
    const p = await makePlayer();
    await creditPack(db, { playerId: p.id, sessions: 4, amount: 0, paymentId: null });
    const [slot] = await freeSlots();
    await createBooking(
      { court: slot.court, date: slot.date, start: slot.start, duration: 60, name: 'X', phone: '+255700000001' },
      now(),
    );
    expect(await bookWithPack(p.id, slot)).toEqual({ ok: false, reason: 'taken' });
    expect((await packBalance(p.id)).used).toBe(0);
  });

  it('cannot spend the last session twice, however many bookings race for it', async () => {
    const p = await makePlayer();
    await creditPack(db, { playerId: p.id, sessions: 1, amount: 0, paymentId: null });
    const slots = (await freeSlots()).slice(0, 6);
    expect(slots.length).toBeGreaterThanOrEqual(4);

    const results = await Promise.all(slots.map((s) => bookWithPack(p.id, s)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === 'no-sessions')).toHaveLength(
      slots.length - 1,
    );
    expect(await packBalance(p.id)).toEqual({ bought: 1, used: 1, left: 0 });
  });
});

describe('handing a session back', () => {
  it('returns it when the booking is cancelled', async () => {
    const p = await makePlayer();
    await creditPack(db, { playerId: p.id, sessions: 2, amount: 0, paymentId: null });
    const [slot] = await freeSlots();
    const r = await bookWithPack(p.id, slot);
    if (!r.ok) throw new Error('booking failed');

    expect((await packBalance(p.id)).left).toBe(1);
    expect(await cancelOwnBooking(r.booking.id, now())).toEqual({ ok: true });
    expect((await packBalance(p.id)).left).toBe(2);
  });

  it('does not let a member cancel a session that has already started', async () => {
    const p = await makePlayer();
    await creditPack(db, { playerId: p.id, sessions: 2, amount: 0, paymentId: null });
    const [slot] = await freeSlots();
    const r = await bookWithPack(p.id, slot);
    if (!r.ok) throw new Error('booking failed');

    // Ten minutes after it began.
    const later = Date.parse(`${tomorrow()}T00:00:00Z`) - 3 * 3_600_000 + (slot.start + 10) * 60_000;
    expect(nowLocal(later).date).toBe(slot.date);
    expect(await cancelOwnBooking(r.booking.id, later)).toEqual({ ok: false, reason: 'already' });
    expect((await packBalance(p.id)).used).toBe(1);
  });

  it('lets the desk cancel and return it', async () => {
    const p = await makePlayer();
    await creditPack(db, { playerId: p.id, sessions: 1, amount: 0, paymentId: null });
    const [slot] = await freeSlots();
    const r = await bookWithPack(p.id, slot);
    if (!r.ok) throw new Error('booking failed');
    await cancelBooking(r.booking.id);
    expect((await packBalance(p.id)).left).toBe(1);
  });
});

describe('the database itself', () => {
  it('refuses a pack of zero sessions', async () => {
    const p = await makePlayer();
    await expect(
      creditPack(db, { playerId: p.id, sessions: 0, amount: 0, paymentId: null }),
    ).rejects.toThrow();
  });

  it('refuses a pack payment that does not say how many sessions', async () => {
    const p = await makePlayer();
    const err = await pgError(
      db.execute(sql`
        insert into payments (id, purpose, amount, name, email, player_id)
        values (gen_random_uuid()::text, 'pack', 100000, 'x', 'x@y.z', ${p.id})`),
    );
    expect(err.constraint_name).toBe('payments_target_check');
  });

  it('refuses a pack payment for both a lead and a player', async () => {
    const p = await makePlayer();
    const [lead] = (await db.execute(
      sql`insert into leads (name, phone) values ('a', '+255700000009') returning id`,
    )) as unknown as { id: number }[];
    const err = await pgError(
      db.execute(sql`
        insert into payments (id, purpose, amount, name, email, player_id, lead_id, sessions)
        values (gen_random_uuid()::text, 'pack', 100000, 'x', 'x@y.z', ${p.id}, ${lead.id}, 4)`),
    );
    expect(err.constraint_name).toBe('payments_target_check');
  });
});
