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

import { and, asc, between, eq, gt, inArray, like, lt, lte, or, sql } from 'drizzle-orm';
import { db, type Executor } from './db/client';
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

/**
 * Promote a hold to a confirmed booking (called once the coach says yes, or
 * the moment the player pays for it online).
 *
 * Takes an executor so that paying for a court can confirm it and stamp the
 * payment in one transaction — see `fulfil` and the note on `Executor` in
 * src/lib/db/client.ts.
 */
export async function confirmBooking(id: string, tx: Executor = db): Promise<boolean> {
  const rows = await tx
    .update(bookingsTable)
    .set({ status: 'confirmed', expiresAt: null, confirmedAt: new Date() })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, 'held')))
    .returning({ id: bookingsTable.id });

  return rows.length > 0;
}

/**
 * Is anybody else's live booking sitting on this one's court and time?
 *
 * Asked while fulfilling a payment, and the reason it has to be asked is the
 * gap between `liveAt` and `uniq_live_slot`. An expired hold still occupies
 * its exact start minute in that index, but it does NOT block a booking that
 * merely overlaps — a 60-minute hold that lapsed at 17:30 leaves room for
 * somebody to take 17:00–18:30. So a player can be entering a mobile-money
 * PIN while their slot is sold underneath them, and the only honest thing to
 * do about it is look before confirming.
 *
 * Callers hold the court-day advisory lock, so the answer cannot go stale
 * between here and the confirm.
 */
export async function overlappedByOthers(
  booking: { id: string; court_id: number; date: string; start_min: number; end_min: number },
  now: number,
  tx: Executor = db,
): Promise<boolean> {
  const [clash] = await tx
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.courtId, booking.court_id),
        eq(bookingsTable.date, booking.date),
        sql`${bookingsTable.id} <> ${booking.id}`,
        liveAt(new Date(now)),
        lt(bookingsTable.startMin, booking.end_min),
        gt(bookingsTable.endMin, booking.start_min),
      ),
    )
    .limit(1);

  return Boolean(clash);
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
export async function markPaid(id: string, paid = true, tx: Executor = db): Promise<boolean> {
  const rows = await tx
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
/**
 * A booking by the reference the desk quotes.
 *
 * The id is a UUID and nobody reads one out; every screen shows its first
 * eight characters and that is what gets written on a scrap of paper and
 * repeated over the phone. So this accepts either — a full id, or any prefix
 * of one — and is the only lookup that does.
 *
 * Ambiguity is reported rather than resolved. Eight hex characters is four
 * billion, so two bookings sharing a prefix will realistically never happen;
 * if it does, picking one of them silently is the one behaviour that could
 * cancel the wrong person's court.
 */
export async function bookingByReference(
  ref: string,
): Promise<{ booking: DeskBooking } | { ambiguous: DeskBooking[] } | null> {
  const rows = await db
    .select()
    .from(bookingsTable)
    // `like` with the prefix, not a regex: the primary key index can serve it.
    .where(like(bookingsTable.id, `${ref}%`))
    .orderBy(asc(bookingsTable.createdAt))
    .limit(5);

  if (rows.length === 0) return null;
  if (rows.length > 1) return { ambiguous: rows.map(toDeskBooking) };
  return { booking: toDeskBooking(rows[0]) };
}

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

/**
 * Money the club has earned on court and not collected.
 *
 * Confirmed bookings, on or before today, still unpaid. The three conditions
 * are each doing work: a held booking is not yet owed for, a booking next
 * Tuesday is not owed for yet either, and a cancelled one never will be.
 *
 * This is the "still owed" figure on Takings, and it is the number the club
 * has never been able to see — it was only ever a scatter of false booleans.
 */
export async function owedOnCourts(today: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${bookingsTable.amount}), 0)::int` })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, 'confirmed'),
        eq(bookingsTable.paid, false),
        lte(bookingsTable.date, today),
      ),
    );

  return row?.total ?? 0;
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

/**
 * Court bookings over a window, counted.
 *
 * "How many people played between these dates?" as the bookings table can
 * answer it — which is not the same question the attendance register
 * answers, and is not interchangeable with it. Two differences matter and
 * are the reason both exist:
 *
 *   - A booking is a slot sold, not a person on court. Four players on one
 *     court are one row, and the club has never known which.
 *   - The row is keyed by whatever name and number the booker gave, so
 *     `people` counts distinct numbers and is short by however many walk-ins
 *     left the number blank. That count is reported separately rather than
 *     folded in, because a blank number is a real state here.
 *
 * Cancellations fall out. Lapsed holds do not, for the reason `hoursByDate`
 * keeps them: a held slot on a past day is still a court-hour nobody else
 * could buy.
 */
export type BookingTotals = {
  from: string;
  to: string;
  /** Live bookings in the window. */
  bookings: number;
  /** Distinct phone numbers among them. */
  people: number;
  /** Bookings with no number on file, so outside `people`. */
  anonymous: number;
  /** Bookings that also booked the coach. */
  coached: number;
  courtHours: number;
  /** Shillings, split by whether the money has actually come in. */
  paid: number;
  unpaid: number;
};

export async function bookingTotals(from: string, to: string): Promise<BookingTotals> {
  const [row] = await db
    .select({
      bookings: sql<number>`count(*)::int`,
      people: sql<number>`count(distinct ${bookingsTable.phone}) filter (
        where ${bookingsTable.phone} <> '')::int`,
      anonymous: sql<number>`count(*) filter (where ${bookingsTable.phone} = '')::int`,
      coached: sql<number>`count(*) filter (where ${bookingsTable.coach})::int`,
      minutes: sql<number>`coalesce(sum(${bookingsTable.endMin} - ${bookingsTable.startMin}), 0)::int`,
      paid: sql<number>`coalesce(sum(${bookingsTable.amount}) filter (
        where ${bookingsTable.paid}), 0)::int`,
      unpaid: sql<number>`coalesce(sum(${bookingsTable.amount}) filter (
        where not ${bookingsTable.paid}), 0)::int`,
    })
    .from(bookingsTable)
    .where(
      and(
        between(bookingsTable.date, from, to),
        inArray(bookingsTable.status, ['held', 'confirmed']),
      ),
    );

  return {
    from,
    to,
    bookings: row?.bookings ?? 0,
    people: row?.people ?? 0,
    anonymous: row?.anonymous ?? 0,
    coached: row?.coached ?? 0,
    courtHours: (row?.minutes ?? 0) / 60,
    paid: row?.paid ?? 0,
    unpaid: row?.unpaid ?? 0,
  };
}
