import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBooking } from '@/lib/bookings';
import { db } from '@/lib/db/client';
import { bookings, leads, players, sessionPacks } from '@/lib/db/schema';
import { fulfil } from '@/lib/fulfil';
import { packBalance } from '@/lib/packs';
import { createPayment, getPayment } from '@/lib/payments';
import { nowLocal } from '@/lib/time';
import { freeSlot, makeLead, makePlayer, markPaid, reset } from './helpers';

beforeEach(reset);

const later = () => new Date(Date.now() + 72 * 3_600_000);

function packPayment(target: { leadId: number } | { playerId: number }, sessions = 8, phone = '+255754000111') {
  return createPayment({
    purpose: 'pack',
    amount: 175_000,
    sessions,
    ...target,
    name: 'Amina Juma',
    phone,
    email: 'no-reply@meruclay.invalid',
    expiresAt: later(),
  });
}

describe('fulfilling a pack bought by a newcomer', () => {
  it('does nothing until the money is in', async () => {
    const lead = await makeLead();
    const pay = await packPayment({ leadId: lead.id });
    const r = await fulfil(pay.id);
    expect(r.ok).toBe(false);
    expect(r.outcome).toBe('unpaid');
    expect(await db.select().from(players)).toHaveLength(0);
  });

  it('puts them on the roster on the pack tier with the sessions credited', async () => {
    const lead = await makeLead();
    const pay = await packPayment({ leadId: lead.id });
    await markPaid(pay.id);

    const r = await fulfil(pay.id);
    expect(r).toMatchObject({ ok: true, outcome: 'fulfilled' });

    const [member] = await db.select().from(players);
    expect(member).toMatchObject({ name: 'Amina Juma', phone: '+255754000111', membership: 'pack' });
    expect(await packBalance(member.id)).toEqual({ bought: 8, used: 0, left: 8 });

    const [pack] = await db.select().from(sessionPacks);
    expect(pack).toMatchObject({ paymentId: pay.id, amount: 175_000, sessions: 8 });

    const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(after.stage).toBe('joined');
    expect(after.playerId).toBe(member.id);
    expect((await getPayment(pay.id))?.fulfilledAt).not.toBeNull();
  });

  it('credits exactly once however many times it is fulfilled, even at once', async () => {
    const lead = await makeLead();
    const pay = await packPayment({ leadId: lead.id });
    await markPaid(pay.id);

    const results = await Promise.all([fulfil(pay.id), fulfil(pay.id), fulfil(pay.id)]);
    expect(results.filter((r) => r.ok && r.outcome === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.ok && r.outcome === 'already')).toHaveLength(2);
    await fulfil(pay.id);

    expect(await db.select().from(players)).toHaveLength(1);
    expect(await db.select().from(sessionPacks)).toHaveLength(1);
  });

  it('adds the pack to the existing member when their number is already on the roster', async () => {
    const existing = await makePlayer({ name: 'Amina J', phone: '+255754000111', membership: 'monthly' });
    const lead = await makeLead();
    const pay = await packPayment({ leadId: lead.id });
    await markPaid(pay.id);

    expect((await fulfil(pay.id)).ok).toBe(true);
    const all = await db.select().from(players);
    expect(all).toHaveLength(1);
    // Their tier is the desk's business; the pack is added alongside it.
    expect(all[0].membership).toBe('monthly');
    expect((await packBalance(existing.id)).left).toBe(8);
  });
});

describe('fulfilling a top-up', () => {
  it('adds to what the member already has', async () => {
    const p = await makePlayer();
    const first = await packPayment({ playerId: p.id }, 4, p.phone);
    const second = await packPayment({ playerId: p.id }, 8, p.phone);
    await markPaid(first.id);
    await markPaid(second.id);
    await fulfil(first.id);
    await fulfil(second.id);
    expect(await packBalance(p.id)).toEqual({ bought: 12, used: 0, left: 12 });
  });

  it('refuses, and says why, when the member has left the club', async () => {
    const p = await makePlayer({ active: false });
    const pay = await packPayment({ playerId: p.id }, 4, p.phone);
    await markPaid(pay.id);

    const r = await fulfil(pay.id);
    expect(r).toMatchObject({ ok: false, outcome: 'blocked' });
    expect((await getPayment(pay.id))?.failureReason).toMatch(/no longer on the roster/);
    expect(await db.select().from(sessionPacks)).toHaveLength(0);
  });
});

describe('fulfilling a court paid for online', () => {
  it('confirms the hold and marks it paid', async () => {
    const slot = await freeSlot();
    const made = await createBooking(
      { court: slot.court, date: slot.date, start: slot.start, duration: 60, name: 'A', phone: '+255700000002' },
      nowLocal().epochMs,
    );
    if (!made.ok) throw new Error('could not book');
    const pay = await createPayment({
      purpose: 'booking',
      amount: 30_000,
      bookingId: made.booking.id,
      name: 'A',
      phone: '+255700000002',
      email: 'x@meruclay.invalid',
      expiresAt: later(),
    });
    await markPaid(pay.id);

    expect(await fulfil(pay.id)).toMatchObject({ ok: true, outcome: 'fulfilled' });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, made.booking.id));
    expect(row).toMatchObject({ status: 'confirmed', paid: true, expiresAt: null });
  });
});
