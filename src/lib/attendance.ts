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

import { and, desc, eq, lte, sql } from 'drizzle-orm';
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
