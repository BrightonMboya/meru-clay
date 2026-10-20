import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The whole thing, end to end, the way a person does it: join on the website,
 * approve the prompt, book courts with the sessions, run out.
 *
 * Snippe is the only thing faked, and only at its one module — the charge
 * says the prompt went out and the verify says the money came in. Everything
 * between (the pay route, the webhook-equivalent settle, fulfilment, the
 * ledger, the roster) is the real code against a real Postgres.
 */
const snippe = vi.hoisted(() => ({ paid: new Map<string, number>(), refs: 0 }));

vi.mock('@/lib/snippe', async (original) => {
  const real = await original<typeof import('@/lib/snippe')>();
  return {
    ...real,
    snippeConfigured: () => true,
    chargeMobileMoney: vi.fn(async (input: { amount: number }) => {
      const reference = `snp-${++snippe.refs}`;
      snippe.paid.set(reference, input.amount);
      return { ok: true, reference, status: 'pending', expiresAt: null };
    }),
    verifyPayment: vi.fn(async (reference: string) => ({
      ok: true,
      status: 'completed',
      amount: snippe.paid.get(reference) ?? null,
      currency: 'TZS',
    })),
  };
});

const { POST: join } = await import('@/app/api/join/route');
const { POST: pay } = await import('@/app/api/payments/[id]/pay/route');
const { GET: viewPayment } = await import('@/app/api/payments/[id]/route');
const { POST: book } = await import('@/app/api/bookings/route');
const { POST: lookup } = await import('@/app/api/members/lookup/route');
const { settle } = await import('@/lib/settle');
const { getPayment } = await import('@/lib/payments');
const { loadRoster } = await import('@/lib/admin/load');
const { freeSlots, post, reset } = await import('./helpers');
const { log } = await import('@/lib/log');

beforeEach(reset);

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

/** What happens when Snippe's webhook lands for this payment. */
async function approve(paymentId: string) {
  const p = await getPayment(paymentId);
  return settle(paymentId, p!.providerRef!, 'webhook');
}

describe('a member’s whole journey', () => {
  it('joins, pays, shows on the dashboard, books, and runs out', async () => {
    const info = vi.spyOn(log, 'info');
    // 1. Join: no email, pick 4 sessions.
    const joined = await join(post('/api/join', { name: 'Tony Mushi', phone: '0712 345 678', sessions: 4 }));
    expect(joined.status).toBe(201);
    const { id } = await json(joined);

    // 2. The prompt goes to their phone.
    const prompt = await pay(post(`/api/payments/${id}/pay`, { phone: '0712345678' }), ctx(id as string));
    expect(prompt.status).toBe(200);
    expect((await getPayment(id as string))?.status).toBe('processing');

    // 3. They approve; Snippe's webhook lands. Twice, as webhooks do.
    expect((await approve(id as string)).outcome).toBe('fulfilled');
    expect((await approve(id as string)).outcome).toBe('already');

    // 4. /pay says it is done.
    expect(await json(await viewPayment(new Request('http://test'), ctx(id as string)))).toMatchObject({
      done: true,
      purpose: 'pack',
    });

    // 5. The dashboard has them, with four sessions.
    let roster = await loadRoster();
    let tony = roster.players.find((p) => p.name === 'Tony Mushi');
    expect(tony?.membership).toBe('pack');
    expect(tony?.sessions).toEqual({ bought: 4, used: 0, left: 4 });
    expect(tony?.due).toBe(false);

    // 6. The booking page finds them by number.
    expect(await json(await lookup(post('/api/members/lookup', { phone: '+255 712 345 678' })))).toMatchObject({
      found: true,
      firstName: 'Tony',
      left: 4,
    });

    // 7. Three bookings with sessions.
    const slots = await freeSlots();
    for (const s of slots.slice(0, 3)) {
      const res = await book(post('/api/bookings', { ...s, phone: '712345678', pack: true }));
      expect(res.status).toBe(201);
    }

    // 8. "Tony paid for 4 and has played 3, so 1 left."
    roster = await loadRoster();
    tony = roster.players.find((p) => p.name === 'Tony Mushi');
    expect(tony?.sessions).toEqual({ bought: 4, used: 3, left: 1 });

    // 9. Last one, then nothing.
    expect((await book(post('/api/bookings', { ...slots[3], phone: '0712345678', pack: true }))).status).toBe(201);
    expect((await book(post('/api/bookings', { ...slots[4], phone: '0712345678', pack: true }))).status).toBe(409);

    // 10. Top up with 8 more: same member, twelve bought.
    const again = await json(await join(post('/api/join', { name: 'Tony Mushi', phone: '0712345678', sessions: 8 })));
    await pay(post(`/api/payments/${again.id}/pay`, { phone: '0712345678' }), ctx(again.id as string));
    expect((await approve(again.id as string)).outcome).toBe('fulfilled');

    // 11. And every step of it is in Axiom, by name.
    const events = info.mock.calls.map((c) => c[0]);
    for (const name of [
      'membership.checkout_opened',
      'payment.prompt_sent',
      'payment.fulfilled',
      'pack.credited',
      'member.lookup',
      'booking.pack_spent',
      'booking.no_sessions',
    ]) {
      expect(events).toContain(name);
    }
    expect(info.mock.calls.find((c) => c[0] === 'pack.credited')?.[1]).toMatchObject({
      sessions: 4,
      amount: 100_000,
      topUp: false,
    });
    // No phone numbers or names in any event.
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/712345678|Tony/);
    info.mockRestore();

    roster = await loadRoster();
    expect(roster.players.filter((p) => p.name === 'Tony Mushi')).toHaveLength(1);
    expect(roster.players.find((p) => p.name === 'Tony Mushi')?.sessions).toEqual({
      bought: 12,
      used: 4,
      left: 8,
    });
  });

  it('a visitor pays for a court and it is confirmed', async () => {
    const [slot] = await freeSlots(undefined, 90);
    const created = await json(
      await book(post('/api/bookings', { ...slot, duration: 90, name: 'Asha', phone: '0754 111 222' })),
    );
    expect(created.status).toBe('held');

    const paymentId = created.paymentId as string;
    expect((await pay(post(`/api/payments/${paymentId}/pay`, { phone: '0754111222' }), ctx(paymentId))).status).toBe(200);
    expect((await approve(paymentId)).outcome).toBe('fulfilled');

    const view = await json(await viewPayment(new Request('http://test'), ctx(paymentId)));
    expect(view).toMatchObject({ done: true, amount: 45_000, bookingId: created.id });
  });

  it('a short payment is never treated as paid', async () => {
    const { id } = await json(
      await join(post('/api/join', { name: 'Tony Mushi', phone: '0712345678', sessions: 20 })),
    );
    await pay(post(`/api/payments/${id}/pay`, { phone: '0712345678' }), ctx(id as string));
    const p = await getPayment(id as string);
    snippe.paid.set(p!.providerRef!, 1_000);

    const error = vi.spyOn(log, 'error');
    expect((await approve(id as string)).outcome).not.toBe('fulfilled');
    expect(error.mock.calls.map((c) => c[0])).toContain('payment.needs_attention');
    error.mockRestore();
    const roster = await loadRoster();
    expect(roster.players.find((x) => x.name === 'Tony Mushi')?.sessions ?? null).toBeNull();
  });
});
