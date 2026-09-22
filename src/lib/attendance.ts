/**
 * Attendance — storage.
 *
 * One row per player per day, written by the desk. See the note on the
 * `attendance` table in src/lib/db/schema.ts for why this exists alongside
 * the bookings and class places the roster already reads: those are keyed by
 * phone number, and a third of the club has none on file.
 *
 * Nothing here occupies a court. Recording that somebody played on Saturday
 * changes what the roster says about them and nothing about what /book can
 * sell for Saturday.
 */

import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from './db/client';
import { attendance, players } from './db/schema';

/**
 * Write one day's attendance.
 *
 * `false` means the row was already there. The desk marking the same player
 * on the same day twice is a slip rather than an error — two people at the
 * counter, or a double tap — so the unique index absorbs it and the caller
 * gets to say "already recorded" instead of "that failed".
 */
export async function recordAttendance(playerId: number, date: string): Promise<boolean> {
  const written = await db
    .insert(attendance)
    .values({ playerId, date })
    .onConflictDoNothing({ target: [attendance.playerId, attendance.date] })
    .returning({ id: attendance.id });

  return written.length > 0;
}

/**
 * When each player was last marked present, as `playerId -> YYYY-MM-DD`.
 *
 * Future dates are excluded for the same reason `lastPlayedByPhone` excludes
 * them: "last played" is a fact about the past, and the desk can record a
 * date ahead of today by mistyping a month.
 *
 * `::text` on the aggregate is not decoration — `max(date)` bypasses
 * Drizzle's column mapping and postgres.js would hand back a Date.
 */
export async function lastAttendedByPlayer(today: string): Promise<Record<number, string>> {
  const rows = await db
    .select({ playerId: attendance.playerId, last: sql<string>`max(${attendance.date})::text` })
    .from(attendance)
    .where(lte(attendance.date, today))
    .groupBy(attendance.playerId);

  return Object.fromEntries(rows.map((row) => [row.playerId, row.last]));
}

/** Does this id belong to somebody still on the roster? */
export async function isOnRoster(playerId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.active, true)))
    .limit(1);

  return Boolean(row);
}

/** The last few days recorded for one player, newest first. */
export async function recentFor(playerId: number, limit = 5): Promise<string[]> {
  const rows = await db
    .select({ date: attendance.date })
    .from(attendance)
    .where(eq(attendance.playerId, playerId))
    .orderBy(desc(attendance.date))
    .limit(limit);

  return rows.map((row) => row.date);
}

/**
 * The register over a window, counted.
 *
 * `days` is player-days, not people: somebody who came on Tuesday and
 * Saturday is two days and one player. Both figures are wanted and they are
 * different questions, so both are returned rather than one being chosen
 * here and misread later.
 *
 * Two grouped queries rather than one. Per-player needs the join to
 * `players` for a name; per-date does not, and making one query do both
 * would mean grouping by a pair and re-aggregating in JS.
 */
export type AttendanceTotals = {
  from: string;
  to: string;
  /** Rows in the window. One player on two days counts twice. */
  days: number;
  /** Distinct players who were marked present at least once. */
  players: number;
  /** Most days first. */
  byPlayer: Array<{ playerId: number; name: string; days: number; lastOn: string }>;
  /** Player-days per date, ascending. A date nobody came is absent, not zero. */
  byDate: Array<{ date: string; players: number }>;
};

export async function attendedBetween(from: string, to: string): Promise<AttendanceTotals> {
  const window = and(gte(attendance.date, from), lte(attendance.date, to));

  const [perPlayer, perDate] = await Promise.all([
    db
      .select({
        playerId: attendance.playerId,
        name: players.name,
        days: sql<number>`count(*)::int`,
        lastOn: sql<string>`max(${attendance.date})::text`,
      })
      .from(attendance)
      .innerJoin(players, eq(players.id, attendance.playerId))
      .where(window)
      .groupBy(attendance.playerId, players.name)
      .orderBy(desc(sql`count(*)`), asc(players.name)),

    db
      .select({
        date: sql<string>`${attendance.date}::text`,
        players: sql<number>`count(*)::int`,
      })
      .from(attendance)
      .where(window)
      .groupBy(attendance.date)
      .orderBy(asc(attendance.date)),
  ]);

  return {
    from,
    to,
    days: perPlayer.reduce((n, r) => n + r.days, 0),
    players: perPlayer.length,
    byPlayer: perPlayer,
    byDate: perDate,
  };
}
