import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as book } from '@/app/api/bookings/route';
import { DELETE as cancel } from '@/app/api/bookings/[id]/route';
import { fulfil } from '@/lib/fulfil';
import { notifyPaidCancel } from '@/lib/notify';
import { creditPack } from '@/lib/packs';
import { db } from '@/lib/db/client';
import { freeSlot, makePlayer, markPaid, post, reset } from './helpers';

vi.mock('@/lib/notify', async (original) => ({
  ...(await original<typeof import('@/lib/notify')>()),
  notifyPaidCancel: vi.fn(async () => {}),
}));

const told = vi.mocked(notifyPaidCancel);

beforeEach(async () => {
  await reset();
  told.mockClear();
});

type Json = Record<string, unknown>;

async function holdCourt(extra: Json = {}) {
  const res = await book(
    post('/api/bookings', {
      ...(await freeSlot()),
      name: 'Asha Mollel',
      phone: '0712 345 678',
      ...extra,
    }),
  );
  return (await res.json()) as Json;
}

function cancelIt(id: string) {
  return cancel(new Request(`http://test/api/bookings/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}

/** `after()` runs its callback without waiting in tests; give it a moment. */
const settled = () => new Promise((r) => setTimeout(r, 300));

describe('a player cancelling their own court', () => {
  it('tells the club when the court was paid for online', async () => {
    const created = await holdCourt();
    await markPaid(created.paymentId as string);
    expect((await fulfil(created.paymentId as string)).ok).toBe(true);

    expect((await cancelIt(created.id as string)).status).toBe(200);
    await settled();

    expect(told).toHaveBeenCalledTimes(1);
    expect(told.mock.calls[0][1]).toMatchObject({
      bookingId: created.id,
      name: 'Asha Mollel',
      phone: '+255712345678',
      amount: expect.any(Number),
      paidOn: expect.any(String),
    });
    expect(told.mock.calls[0][1].amount).toBeGreaterThan(0);
  });

  it('says nothing for an unpaid hold', async () => {
    const created = await holdCourt();
    expect((await cancelIt(created.id as string)).status).toBe(200);
    await settled();
    expect(told).not.toHaveBeenCalled();
  });

  it('says nothing for a court booked with a session, which hands the session back', async () => {
    const member = await makePlayer();
    await creditPack(db, { playerId: member.id, sessions: 4, amount: 100_000, paymentId: null });
    const created = await holdCourt({ pack: true });
    expect(created.paymentId).toBeNull();

    expect((await cancelIt(created.id as string)).status).toBe(200);
    await settled();
    expect(told).not.toHaveBeenCalled();
  });
});
