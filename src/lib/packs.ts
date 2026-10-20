/**
 * Session packs — storage.
 *
 * Plain functions over Drizzle, the same shape as every other storage module
 * here. The one rule worth knowing before reading: a pack's balance is never
 * a column. It is the sessions bought less the live bookings that point at
 * the pack (`bookings.pack_id`), counted when asked. A cancelled booking
 * therefore hands its session back with nothing to keep in step, and the
 * dashboard's figure cannot disagree with the court sheet.
 *
 * Spending a session is not done here. It happens inside `createBooking`, in
 * the same transaction as the insert, because "has a session left" and "the
 * booking that uses it" must be one decision — see `spendablePack`.
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import { db, type Executor } from './db/client';
import { bookings, sessionPacks } from './db/schema';

/** What a member has, across every pack they have bought. */
export type PackBalance = { bought: number; used: number; left: number };

/** A booking that still holds its session: anything not cancelled. */
const spent = sql`${bookings.status} <> 'cancelled'`;

/** One member's sessions. All zeros for somebody who has never bought a pack. */
export async function packBalance(playerId: number, tx: Executor = db): Promise<PackBalance> {
  const all = await packBalances(tx, playerId);
  return all.get(playerId) ?? { bought: 0, used: 0, left: 0 };
}

/**
 * Every member's sessions, keyed by player — one query for the whole roster
 * rather than one per row. Members who have never bought a pack are absent.
 */
export async function packBalances(
  tx: Executor = db,
  playerId?: number,
): Promise<Map<number, PackBalance>> {
  const used = tx
    .select({
      packId: bookings.packId,
      n: sql<number>`count(*)::int`.as('n'),
    })
    .from(bookings)
    .where(and(sql`${bookings.packId} is not null`, spent))
    .groupBy(bookings.packId)
    .as('used');

  const rows = await tx
    .select({
      playerId: sessionPacks.playerId,
      bought: sql<number>`sum(${sessionPacks.sessions})::int`,
      used: sql<number>`coalesce(sum(${used.n}), 0)::int`,
    })
    .from(sessionPacks)
    .leftJoin(used, eq(used.packId, sessionPacks.id))
    .where(playerId === undefined ? sql`true` : eq(sessionPacks.playerId, playerId))
    .groupBy(sessionPacks.playerId);

  return new Map(
    rows.map((r) => [
      r.playerId,
      { bought: r.bought, used: r.used, left: Math.max(0, r.bought - r.used) },
    ]),
  );
}

/**
 * Put a pack on a member. Called while fulfilling the payment that bought it.
 *
 * `uniq_pack_payment` makes a second call for the same payment a no-op, so a
 * fulfilment that is retried credits one pack, not two.
 */
export async function creditPack(
  tx: Executor,
  input: { playerId: number; sessions: number; amount: number; paymentId: string | null },
): Promise<void> {
  await tx
    .insert(sessionPacks)
    .values({
      playerId: input.playerId,
      sessions: input.sessions,
      amount: input.amount,
      paymentId: input.paymentId,
    })
    .onConflictDoNothing();
}

/**
 * The pack the next booking should spend, oldest first, or null when every
 * session is used.
 *
 * Takes a transaction-scoped advisory lock on the member first, so two
 * bookings made at once from the same phone cannot both see the last session
 * and both spend it. The caller must insert the booking in the same
 * transaction, before the lock is released by the commit.
 */
export async function spendablePack(tx: Executor, playerId: number): Promise<number | null> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pack:${playerId}`})::bigint)`);

  const [row] = await tx
    .select({ id: sessionPacks.id })
    .from(sessionPacks)
    .where(
      and(
        eq(sessionPacks.playerId, playerId),
        sql`${sessionPacks.sessions} > (
          select count(*) from ${bookings}
          where ${bookings.packId} = ${sessionPacks.id} and ${spent}
        )`,
      ),
    )
    .orderBy(asc(sessionPacks.createdAt), asc(sessionPacks.id))
    .limit(1);

  return row?.id ?? null;
}
