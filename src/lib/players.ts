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

import { and, asc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { db } from './db/client';
import { bookings, classEnrolments, players } from './db/schema';
import { MEMBERSHIP_TIERS, type MembershipTier } from './pricing';
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

export async function getPlayer(id: number): Promise<PlayerRow | null> {
  const [row] = await db
    .select(shape)
    .from(players)
    .where(and(eq(players.id, id), eq(players.active, true)));
  return row ?? null;
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
): Promise<PlayerRow | null> {
  const level = input.level ?? null;
  const [row] = await db
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
 */
export async function markMembershipPaid(id: number, today: string): Promise<PlayerRow | null> {
  const current = await getPlayer(id);
  if (!current) return null;

  const { months } = MEMBERSHIP_TIERS[current.membership];
  if (months === 0) return current;

  const from = current.paidUntil && current.paidUntil > today ? current.paidUntil : today;

  const [row] = await db
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
