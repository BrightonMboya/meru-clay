import { sql } from 'drizzle-orm';
import { GET as availability } from '@/app/api/availability/route';
import { db } from '@/lib/db/client';
import { leads, players } from '@/lib/db/schema';
import { markSuccessful } from '@/lib/payments';
import { closedOn } from '@/lib/schedule';
import { addDays, nowLocal, weekdayOf } from '@/lib/time';

/**
 * Empty every table the club writes to, keeping the courts the migrations
 * seeded. Called before each test so none of them can lean on another.
 */
export async function reset() {
  await db.execute(sql`
    truncate table session_packs, payment_events, payments, attendance, class_enrolments,
      trials, bookings, blocks, lead_messages, leads, players restart identity cascade
  `);
}

/**
 * The next day the club is open, from tomorrow — always bookable, never "too
 * soon". Skips the weekly closed day (Monday maintenance), so the suite does
 * not fail on a Sunday.
 */
export const tomorrow = () => {
  let d = addDays(nowLocal().date, 1);
  while (closedOn(weekdayOf(d))) d = addDays(d, 1);
  return d;
};

export async function makePlayer(
  over: Partial<typeof players.$inferInsert> & { name?: string; phone?: string } = {},
) {
  const [row] = await db
    .insert(players)
    .values({ name: 'Tony Mushi', phone: '+255712345678', membership: 'pack', ...over })
    .returning();
  return row;
}

export async function makeLead(over: Partial<typeof leads.$inferInsert> = {}) {
  const [row] = await db
    .insert(leads)
    .values({ name: 'Amina Juma', phone: '+255754000111', ...over })
    .returning();
  return row;
}

/** A free slot from the real availability route, so schedules and blocks are honoured. */
export async function freeSlot(date = tomorrow(), duration = 60, coach = false) {
  const res = await availability(
    new Request(
      `http://test/api/availability?date=${date}&duration=${duration}${coach ? '&coach=1' : ''}`,
    ),
  );
  const body = (await res.json()) as { slots: { court: number; start: number; end: number }[] };
  if (!body.slots.length) throw new Error(`no free slot on ${date}`);
  return { date, duration, ...body.slots[0] };
}

/**
 * Free slots that do not overlap one another, for tests that book several.
 * Availability offers a start every half hour, so consecutive offers overlap
 * and all but one of them would rightly lose as 'taken'.
 */
export async function freeSlots(date = tomorrow(), duration = 60) {
  const res = await availability(
    new Request(`http://test/api/availability?date=${date}&duration=${duration}`),
  );
  const body = (await res.json()) as { slots: { court: number; start: number; end: number }[] };
  const kept: { court: number; start: number; end: number }[] = [];
  for (const s of body.slots) {
    if (!kept.some((k) => k.court === s.court && k.start < s.end && s.start < k.end)) kept.push(s);
  }
  return kept.map((s) => ({ date, duration, ...s }));
}

/** The Postgres error under Drizzle's "Failed query" wrapper. */
export async function pgError(work: Promise<unknown>): Promise<{ constraint_name?: string }> {
  try {
    await work;
  } catch (err) {
    return ((err as { cause?: unknown }).cause ?? err) as { constraint_name?: string };
  }
  throw new Error('expected the database to refuse');
}

export function post(url: string, body: unknown) {
  return new Request(`http://test${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Record a payment as paid the way `settle` does, without asking Snippe. */
export async function markPaid(paymentId: string) {
  await markSuccessful(paymentId, { providerRef: `test-${paymentId}` });
}
