/**
 * The club roster — storage.
 *
 * The same shape as every other storage module here: plain functions over
 * Drizzle, handing back plain objects, so that the routes and the view model
 * in src/lib/admin/players.ts never see a column name.
 *
 * Two things are worth pointing out.
 *
 * `lastPlayedByPhone` is the reason a phone number matters more than anything
 * else on the roster. Nothing links a booking to a member row — /book takes a
 * name and a number from whoever turns up, member or not — so the number is
 * the join, and a member with no number on file simply has no history the
 * club can see. The roster says so rather than leaving the column blank.
 *
 * `setLevel` is the only write that keeps history. It moves the old level to
 * `previous_level` and stamps the day, which is the whole mechanism behind
 * "moved up a level this month"; see `promotions` in the view model.
 */

import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { db, type Executor } from './db/client';
import { bookings, classEnrolments, players } from './db/schema';
import { MEMBERSHIP_TIERS, lapses, type MembershipTier } from './pricing';
import type { MaybeLevel, PlayerAvailability, PlayerRole } from './roster';

/** One person, as everything above this file thinks of them. */
export type PlayerRow = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  role: PlayerRole;
  level: MaybeLevel;
  previousLevel: MaybeLevel;
  levelSetAt: string | null;
  birthYear: number | null;
  guardianName: string | null;
  guardianPhone: string | null;
  membership: MembershipTier;
  paidUntil: string | null;
  availability: PlayerAvailability;
  wins: number;
  losses: number;
  joinedOn: string;
  notes: string | null;
};

const shape = {
  id: players.id,
  name: players.name,
  phone: players.phone,
  email: players.email,
  role: players.role,
  level: players.level,
  previousLevel: players.previousLevel,
  levelSetAt: players.levelSetAt,
  birthYear: players.birthYear,
  guardianName: players.guardianName,
  guardianPhone: players.guardianPhone,
  membership: players.membership,
  paidUntil: players.paidUntil,
  availability: players.availability,
  wins: players.wins,
  losses: players.losses,
  joinedOn: players.joinedOn,
  notes: players.notes,
};

/**
 * Everyone still at the club, alphabetically.
 *
 * The whole roster in one query, unpaged on purpose: a club of this size is a
 * few dozen rows, and holding all of them lets the screen filter and search
 * without another round trip. Revisit at four figures, not before.
 */
export function listPlayers(): Promise<PlayerRow[]> {
  return db.select(shape).from(players).where(eq(players.active, true)).orderBy(asc(players.name));
}

export async function getPlayer(id: number, tx: Executor = db): Promise<PlayerRow | null> {
  const [row] = await tx
    .select(shape)
    .from(players)
    .where(and(eq(players.id, id), eq(players.active, true)));
  return row ?? null;
}

/**
 * The live member on a number, if there is one.
 *
 * Used by /renew, where somebody types their phone number to be sent a
 * payment link. `uniq_player_phone` guarantees at most one active row per
 * number, so this cannot be ambiguous — and a number with no row is the
 * normal case, not an error.
 *
 * The caller must never tell the outside world which of the two happened.
 * See the note on non-enumeration in src/app/api/join/route.ts.
 */
export async function playerByPhone(phone: string): Promise<PlayerRow | null> {
  if (!phone) return null;
  const [row] = await db
    .select(shape)
    .from(players)
    .where(and(eq(players.phone, phone), eq(players.active, true)))
    .limit(1);
  return row ?? null;
}

/**
 * Members whose term runs out on or before `through`, soonest first.
 *
 * The reminder job's queue. Only tiers with a term can appear — pay as you
 * play never falls due, which is the whole point of it — and that filter is
 * `lapses`, not a hardcoded list, so adding a tier does not silently start
 * chasing people who owe nothing.
 */
export async function dueBy(through: string): Promise<PlayerRow[]> {
  const rows = await db
    .select(shape)
    .from(players)
    .where(
      and(
        eq(players.active, true),
        eq(players.role, 'member'),
        or(isNull(players.paidUntil), lte(players.paidUntil, through)),
      ),
    )
    .orderBy(asc(players.paidUntil));

  return rows.filter((r) => lapses(r.membership));
}

/**
 * When each number was last on a court, as `phone -> YYYY-MM-DD`.
 *
 * Both a confirmed booking and a place in a class count — a junior in the
 * Tuesday clinic has been playing, whatever the bookings table says. Two
 * grouped queries rather than one union: each is an index scan the planner
 * already knows how to do, and merging two small maps in JS is free.
 *
 * `::text` on the aggregate is not decoration. `max(date)` bypasses Drizzle's
 * column mapping, and postgres.js would otherwise hand back a Date.
 */
export async function lastPlayedByPhone(today: string): Promise<Record<string, string>> {
  const [fromBookings, fromClasses] = await Promise.all([
    db
      .select({ phone: bookings.phone, last: sql<string>`max(${bookings.date})::text` })
      .from(bookings)
      .where(
        and(eq(bookings.status, 'confirmed'), lte(bookings.date, today), ne(bookings.phone, '')),
      )
      .groupBy(bookings.phone),
    db
      .select({ phone: classEnrolments.phone, last: sql<string>`max(${classEnrolments.date})::text` })
      .from(classEnrolments)
      .where(
        and(
          eq(classEnrolments.status, 'booked'),
          lte(classEnrolments.date, today),
          ne(classEnrolments.phone, ''),
        ),
      )
      .groupBy(classEnrolments.phone),
  ]);

  const seen: Record<string, string> = {};
  for (const row of [...fromBookings, ...fromClasses]) {
    if (!seen[row.phone] || row.last > seen[row.phone]) seen[row.phone] = row.last;
  }
  return seen;
}

/**
 * Which numbers already have a court in the window, held or confirmed.
 *
 * The roster's "free to play" rail subtracts these: somebody who wants a
 * game and has already got one booked does not need pairing, and listing
 * them is how a useful rail turns into a list nobody reads.
 *
 * A held booking counts. It is a court they are ten minutes from having, and
 * pairing them into a second one would be the desk arguing with itself.
 */
export async function bookedBetween(from: string, to: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ phone: bookings.phone })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, ['held', 'confirmed']),
        gte(bookings.date, from),
        lte(bookings.date, to),
        ne(bookings.phone, ''),
      ),
    );

  return new Set(rows.map((r) => r.phone));
}

export type NewPlayerInput = {
  name: string;
  /** '' for no number on file. */
  phone: string;
  email?: string | null;
  role?: PlayerRole;
  level?: MaybeLevel;
  birthYear?: number | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  membership?: MembershipTier;
  /** Paid up to this date, when they settled on the way in. */
  paidUntil?: string | null;
  availability?: PlayerAvailability;
  joinedOn?: string;
  notes?: string | null;
};

/**
 * Add somebody to the roster.
 *
 * Returns null when that number is already a live member — `uniq_player_phone`
 * decides, not a prior SELECT, so two people at two screens adding the same
 * new member produce one row and one honest refusal.
 */
export async function createPlayer(
  input: NewPlayerInput,
  today: string,
  tx: Executor = db,
): Promise<PlayerRow | null> {
  const level = input.level ?? null;
  const [row] = await tx
    .insert(players)
    .values({
      name: input.name.trim(),
      phone: input.phone,
      email: input.email?.trim() || null,
      role: input.role ?? 'member',
      level,
      // A level given on the way in was still set today; there is just no
      // previous one for it to have moved from.
      levelSetAt: level ? today : null,
      birthYear: input.birthYear ?? null,
      guardianName: input.guardianName?.trim() || null,
      guardianPhone: input.guardianPhone || null,
      membership: input.membership ?? 'monthly',
      paidUntil: input.paidUntil ?? null,
      availability: input.availability ?? 'open',
      joinedOn: input.joinedOn ?? today,
      notes: input.notes?.trim() || null,
    })
    .onConflictDoNothing()
    .returning(shape);

  return row ?? null;
}

/** The fields the roster screen can change without ceremony. */
export type PlayerPatch = {
  name?: string;
  phone?: string;
  email?: string | null;
  membership?: MembershipTier;
  availability?: PlayerAvailability;
  notes?: string | null;
};

export async function updatePlayer(id: number, patch: PlayerPatch): Promise<PlayerRow | null> {
  // Spread rather than assign: an absent key must leave the column alone,
  // where an explicit `undefined` would ask Drizzle to write one.
  const fields: Partial<typeof players.$inferInsert> = {
    ...(patch.name !== undefined && { name: patch.name.trim() }),
    ...(patch.phone !== undefined && { phone: patch.phone }),
    ...(patch.email !== undefined && { email: patch.email?.trim() || null }),
    ...(patch.membership !== undefined && { membership: patch.membership }),
    ...(patch.availability !== undefined && { availability: patch.availability }),
    ...(patch.notes !== undefined && { notes: patch.notes?.trim() || null }),
  };
  if (Object.keys(fields).length === 0) return getPlayer(id);

  const [row] = await db
    .update(players)
    .set(fields)
    .where(and(eq(players.id, id), eq(players.active, true)))
    .returning(shape);

  return row ?? null;
}

/**
 * Assess a player, or un-assess them.
 *
 * The old level is kept as `previous_level` and the day stamped, which is the
 * only history the table holds. Setting the level a player already has is a
 * no-op rather than a promotion from themselves to themselves.
 */
export async function setLevel(
  id: number,
  level: MaybeLevel,
  today: string,
): Promise<PlayerRow | null> {
  const current = await getPlayer(id);
  if (!current) return null;
  if (current.level === level) return current;

  const [row] = await db
    .update(players)
    .set({
      level,
      previousLevel: current.level,
      levelSetAt: level ? today : null,
    })
    .where(and(eq(players.id, id), eq(players.active, true)))
    .returning(shape);

  return row ?? null;
}

/**
 * Take a membership payment.
 *
 * The new term runs from whichever is later — today, or the day their current
 * one runs out — so paying early extends rather than resets, and a member who
 * lapsed three months ago starts a fresh term rather than buying back time
 * they did not use. Pay as you play has no term and so cannot be paid.
 *
 * `tier` is the tier that was PAID FOR, and is passed by anything settling a
 * payment rather than being read off the roster row. The two can differ: a
 * member sent a monthly link who is switched to Term at the desk before they
 * pay would otherwise be given three months for ninety thousand shillings,
 * or a term-payer given one month for two hundred and forty. The money
 * decides the term, not the row — see `payments.tier` in src/lib/db/schema.ts
 * and `applyRenewal` in src/lib/fulfil.ts.
 *
 * It is optional because the desk's own "Take a payment" button has no
 * separate tier to quote: money over the counter is for whatever the member
 * is on, which is the row.
 */
export async function markMembershipPaid(
  id: number,
  today: string,
  opts: { tx?: Executor; tier?: MembershipTier } = {},
): Promise<PlayerRow | null> {
  const tx = opts.tx ?? db;
  const current = await getPlayer(id, tx);
  if (!current) return null;

  const { months } = MEMBERSHIP_TIERS[opts.tier ?? current.membership];
  if (months === 0) return current;

  const from = current.paidUntil && current.paidUntil > today ? current.paidUntil : today;

  const [row] = await tx
    .update(players)
    .set({ paidUntil: sql`(${from}::date + ${`${months} months`}::interval)::date` })
    .where(and(eq(players.id, id), eq(players.active, true)))
    .returning(shape);

  return row ?? null;
}

/**
 * Off the roster. The row stays — a past member is still the name against
 * last season's bookings — and `uniq_player_phone` frees their number, so the
 * same person can be signed up again later.
 */
export async function deactivatePlayer(id: number): Promise<boolean> {
  const rows = await db
    .update(players)
    .set({ active: false })
    .where(and(eq(players.id, id), eq(players.active, true)))
    .returning({ id: players.id });

  return rows.length > 0;
}

/** Coaches, for the shell's operator row. Cheap enough to ask on every page. */
export function listCoaches(): Promise<PlayerRow[]> {
  return db
    .select(shape)
    .from(players)
    .where(and(eq(players.active, true), eq(players.role, 'coach')))
    .orderBy(asc(players.name));
}
