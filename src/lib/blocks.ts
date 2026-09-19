/**
 * Court closures — storage.
 *
 * A block is the club taking a court off the market: rain, resurfacing, a
 * tournament, a private hire the desk took by phone. It is deliberately not a
 * booking — nobody is playing, there is nothing to charge, and it can cover
 * both courts at once.
 *
 * `blocksOn` is already read by the availability engine, so a closure removes
 * the affected start times from /book the moment it is written. That is the
 * whole point of the feature and the reason it lives in the same table the
 * booking engine already consults, rather than in a separate "unavailable"
 * concept the engine would have to learn about.
 *
 * Closures do NOT evict bookings that were already taken. A slot sold before
 * the rain started stays sold and stays on the desk's timeline, where the
 * operator can see it and phone the player. Silently cancelling somebody's
 * court because a block was drawn over it would be the wrong default.
 */

import { asc, eq } from 'drizzle-orm';
import { db } from './db/client';
import { blocks as blocksTable } from './db/schema';
import { CLOSE_MIN, OPEN_MIN } from './time';
import type { BlockRow } from './availability';

export type Block = {
  id: number;
  court_id: number | null;
  date: string;
  start_min: number;
  end_min: number;
  reason: string | null;
};

/** What the availability engine needs. Shape unchanged from the old store. */
export async function blocksOn(date: string): Promise<BlockRow[]> {
  const rows = await db
    .select({
      court_id: blocksTable.courtId,
      start_min: blocksTable.startMin,
      end_min: blocksTable.endMin,
      reason: blocksTable.reason,
    })
    .from(blocksTable)
    .where(eq(blocksTable.date, date));

  return rows;
}

/** The same closures, with their ids, so the desk can draw and lift them. */
export async function deskBlocks(date: string): Promise<Block[]> {
  const rows = await db
    .select()
    .from(blocksTable)
    .where(eq(blocksTable.date, date))
    .orderBy(asc(blocksTable.startMin), asc(blocksTable.courtId));

  return rows.map((r) => ({
    id: r.id,
    court_id: r.courtId,
    date: r.date,
    start_min: r.startMin,
    end_min: r.endMin,
    reason: r.reason,
  }));
}

export type CreateBlockInput = {
  /** null closes every court. */
  court: number | null;
  date: string;
  start: number;
  end: number;
  reason?: string | null;
};

/**
 * Close a court for part of a day.
 *
 * Overlapping closures are allowed and merge visually rather than erroring:
 * closing 10:00–12:00 and then 11:00–14:00 is a normal way for a rain delay
 * to get extended, and refusing the second would be pedantry.
 */
export async function createBlock(input: CreateBlockInput): Promise<Block> {
  const [row] = await db
    .insert(blocksTable)
    .values({
      courtId: input.court,
      date: input.date,
      // Clamp to opening hours: a closure outside them changes nothing and
      // would only draw a block over a part of the day nobody can book.
      startMin: Math.max(OPEN_MIN, input.start),
      endMin: Math.min(CLOSE_MIN, input.end),
      reason: input.reason?.trim() || null,
    })
    .returning();

  return {
    id: row.id,
    court_id: row.courtId,
    date: row.date,
    start_min: row.startMin,
    end_min: row.endMin,
    reason: row.reason,
  };
}

/** Reopen a court. Returns false when the closure was already lifted. */
export async function deleteBlock(id: number): Promise<boolean> {
  const rows = await db
    .delete(blocksTable)
    .where(eq(blocksTable.id, id))
    .returning({ id: blocksTable.id });

  return rows.length > 0;
}

/** Is this a closure the desk is allowed to write at all? */
export function validBlockWindow(start: number, end: number): boolean {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    end > start &&
    start >= OPEN_MIN &&
    end <= CLOSE_MIN
  );
}

/** Narrow a possibly-unknown court id to a real court, or null for "all". */
export function parseCourt(value: unknown, courtIds: number[]): number | null | undefined {
  if (value === null || value === 'all' || value === undefined || value === '') return null;
  const n = Number(value);
  return courtIds.includes(n) ? n : undefined;
}
