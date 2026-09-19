/**
 * Court bookings — storage.
 *
 * Postgres, via Drizzle. The routes and the availability engine never see this
 * file's internals: they call the functions below and get the same plain shapes
 * the in-memory store used to hand back.
 *
 * The one subtle part is the double-booking guard, and it is worth stating
 * plainly. Availability is advisory — it is computed from a snapshot that is
 * stale the moment it is sent. Correctness comes from the write. Two players
 * racing for the last 18:00 slot both attempt the insert and exactly one
 * succeeds, because `createBooking` below does three things in one
 * transaction:
 *
 *   1. Takes a transaction-scoped advisory lock keyed on (court, date), so
 *      only one writer is ever looking at that court's day.
 *   2. Checks for a live booking overlapping the requested window. The unique
 *      index alone cannot do this — it only catches identical start times, and
 *      a 90-minute booking at 17:00 also has to lose to a 60-minute one
 *      already sitting at 17:30.
 *   3. Inserts. `uniq_live_slot` (see src/lib/db/schema.ts) is the last line of
 *      defence, and a unique violation is reported as 'taken' rather than
 *      thrown, so a lock we somehow got around still cannot double-book.
 *
 * Advisory locks are transaction-scoped on purpose: they are released at
 * commit, which is what makes them safe behind Supabase's transaction-mode
 * pooler, where a connection is handed to a different statement the moment the
 * transaction ends.
 */

import { and, asc, between, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from './db/client';
import { bookings as bookingsTable, type BookingRecord } from './db/schema';
import { totalFor } from './pricing';
import { HOLD_MINUTES, type Duration } from './time';
import type { BookingRow } from './availability';

/** Court closures moved to ./blocks; re-exported so callers keep one import. */
export { blocksOn } from './blocks';

export type Booking = {
  id: string;
  court_id: number;
  date: string;
  start_min: number;
  end_min: number;
  name: string;
  phone: string;
  email: string | null;
  /** 1 when the player also booked the coach. Kept numeric: callers test truthiness. */
  coach: number;
  status: 'held' | 'confirmed' | 'cancelled';
};

/** The desk needs more of the row than a player ever does. */
export type DeskBooking = Booking & {
  notes: string | null;
  paid: boolean;
  amount: number;
  expires_at: number | null;
  created_at: number;
};

/**
 * "Still owns its slot": confirmed, or held and not yet expired. Expressed as
 * SQL rather than filtered in JS so an expired hold frees its slot the instant
 * it lapses, without anything having to sweep the table.
 */
function liveAt(now: Date) {
  return or(
    eq(bookingsTable.status, 'confirmed'),
    and(eq(bookingsTable.status, 'held'), gt(bookingsTable.expiresAt, now)),
  );
}

function toBooking(r: BookingRecord): Booking {
  return {
    id: r.id,
    court_id: r.courtId,
    date: r.date,
    start_min: r.startMin,
    end_min: r.endMin,
    name: r.name,
    phone: r.phone,
    email: r.email,
    coach: r.coach ? 1 : 0,
    status: r.status,
  };
}

function toDeskBooking(r: BookingRecord): DeskBooking {
  return {
    ...toBooking(r),
    notes: r.notes,
    paid: r.paid,
    amount: r.amount,
    expires_at: r.expiresAt ? r.expiresAt.getTime() : null,
    created_at: r.createdAt.getTime(),
  };
}

/** Live bookings on a date — expired holds excluded, so they free their slot. */
export async function liveBookings(date: string, now: number): Promise<BookingRow[]> {
  const rows = await db
    .select({
      court_id: bookingsTable.courtId,
      start_min: bookingsTable.startMin,
      end_min: bookingsTable.endMin,
      coach: bookingsTable.coach,
    })
    .from(bookingsTable)
    .where(and(eq(bookingsTable.date, date), liveAt(new Date(now))));

  return rows.map((r) => ({ ...r, coach: r.coach ? 1 : 0 }));
}

export type CreateInput = {
  court: number;
  date: string;
  start: number;
  duration: number;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  coach?: boolean;
  /**
   * Taken at the desk rather than on /book — a walk-in or a phone call. The
   * player is standing there, so there is nothing to hold and nothing to
   * confirm later: the row goes straight in as 'confirmed' with no expiry.
   */
  confirmed?: boolean;
  /** They paid at the counter there and then. */
  paid?: boolean;
};

export type CreateResult = { ok: true; booking: Booking } | { ok: false; reason: 'taken' };

/** Postgres unique-violation. A race got past the overlap check; the slot is gone. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/**
 * Claim a slot. Returns `{ ok: false, reason: 'taken' }` when a live booking
 * already overlaps the requested window — see the note at the top of the file
 * about why this write, and not availability, is what makes a booking correct.
 */
export async function createBooking(input: CreateInput, now: number): Promise<CreateResult> {
  const end = input.start + input.duration;
  const at = new Date(now);
  const expires = new Date(now + HOLD_MINUTES * 60_000);

  try {
    return await db.transaction(async (tx) => {
      // One writer at a time per court-day. Transaction-scoped, so it is
      // released by the commit or rollback below and never outlives either.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${input.court}:${input.date}`})::bigint)`,
      );

      const [clash] = await tx
        .select({ id: bookingsTable.id })
        .from(bookingsTable)
        .where(
          and(
            eq(bookingsTable.courtId, input.court),
            eq(bookingsTable.date, input.date),
            liveAt(at),
            // Half-open overlap: touching at the boundary is not a clash.
            lt(bookingsTable.startMin, end),
            gt(bookingsTable.endMin, input.start),
          ),
        )
        .limit(1);

      if (clash) return { ok: false, reason: 'taken' } as const;

      const [row] = await tx
        .insert(bookingsTable)
        .values({
          id: crypto.randomUUID(),
          courtId: input.court,
          date: input.date,
          startMin: input.start,
          endMin: end,
          name: input.name,
          phone: input.phone,
          email: input.email ?? null,
          notes: input.notes ?? null,
          coach: Boolean(input.coach),
          status: input.confirmed ? 'confirmed' : 'held',
          // A confirmed booking owns its slot outright; only a hold lapses.
          expiresAt: input.confirmed ? null : expires,
          confirmedAt: input.confirmed ? at : null,
          paid: Boolean(input.paid),
          amount: totalFor(input.duration as Duration, Boolean(input.coach)),
          createdAt: at,
        })
        .returning();

      return { ok: true, booking: toBooking(row) } as const;
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'taken' };
    throw err;
  }
}

/** Promote a hold to a confirmed booking (called once the coach says yes). */
export async function confirmBooking(id: string): Promise<boolean> {
  const rows = await db
    .update(bookingsTable)
    .set({ status: 'confirmed', expiresAt: null, confirmedAt: new Date() })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, 'held')))
    .returning({ id: bookingsTable.id });

  return rows.length > 0;
}

/** Release a slot. The row stays for the record; the partial index lets it resell. */
export async function cancelBooking(id: string): Promise<boolean> {
  const rows = await db
    .update(bookingsTable)
    .set({ status: 'cancelled', expiresAt: null })
    .where(and(eq(bookingsTable.id, id), sql`${bookingsTable.status} <> 'cancelled'`))
    .returning({ id: bookingsTable.id });

  return rows.length > 0;
}

/** Mark a booking settled up. The desk chases whatever this has not been called on. */
export async function markPaid(id: string, paid = true): Promise<boolean> {
  const rows = await db
    .update(bookingsTable)
    .set({ paid })
    .where(eq(bookingsTable.id, id))
    .returning({ id: bookingsTable.id });

  return rows.length > 0;
}

export async function getBooking(id: string): Promise<Booking | null> {
  const [row] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
  return row ? toBooking(row) : null;
}

/** The same row with the desk's extra fields — expiry, payment, amount. */
export async function getBookingDetail(id: string): Promise<DeskBooking | null> {
  const [row] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
  return row ? toDeskBooking(row) : null;
}

/**
 * Cancel a booking the player holds the id for.
 *
 * The id is a v4 UUID and is never listed anywhere, so knowing it is the
 * authorisation — the same shape as an unsubscribe link. Only a live booking
 * can be cancelled this way; one that already finished is left alone so a
 * stale link cannot rewrite history.
 */
export async function cancelOwnBooking(id: string, now: number): Promise<
  { ok: true } | { ok: false; reason: 'missing' | 'already' }
> {
  const row = await getBookingDetail(id);
  if (!row) return { ok: false, reason: 'missing' };
  if (row.status === 'cancelled') return { ok: false, reason: 'already' };
  if (row.status === 'held' && row.expires_at !== null && row.expires_at <= now) {
    return { ok: false, reason: 'already' };
  }

  const done = await cancelBooking(id);
  return done ? { ok: true } : { ok: false, reason: 'already' };
}

/**
 * Everything the court desk needs for one day: held (unexpired) and confirmed
 * bookings, in the order they start. Cancelled rows and lapsed holds are left
 * out — the desk is a picture of the day as it will actually happen.
 */
export async function deskBookings(date: string, now: number): Promise<DeskBooking[]> {
  const rows = await db
    .select()
    .from(bookingsTable)
    .where(and(eq(bookingsTable.date, date), liveAt(new Date(now))))
    .orderBy(asc(bookingsTable.startMin), asc(bookingsTable.courtId));

  return rows.map(toDeskBooking);
}

/** Court-hours sold per day across a date range, for the desk's week strip. */
export async function hoursByDate(from: string, to: string): Promise<Record<string, number>> {
  const rows = await db
    .select({
      date: bookingsTable.date,
      minutes: sql<number>`sum(${bookingsTable.endMin} - ${bookingsTable.startMin})::int`,
    })
    .from(bookingsTable)
    // Holds count alongside confirmed bookings: a lapsed hold on a past day is
    // still a court-hour nobody else could buy. Only cancellations fall out.
    .where(
      and(
        between(bookingsTable.date, from, to),
        inArray(bookingsTable.status, ['held', 'confirmed']),
      ),
    )
    .groupBy(bookingsTable.date);

  return Object.fromEntries(rows.map((r) => [r.date, (r.minutes ?? 0) / 60]));
}
