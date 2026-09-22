/**
 * Club class enrolment — storage.
 *
 * A class is not a row anywhere: the weekly grid lives in src/lib/schedule.ts,
 * because the booking engine has to read the same timetable the desk draws. So
 * an enrolment points at a class the only way one can be named — the court and
 * start minute on a date. `classKey`, in that same file, is that name.
 *
 * Enrolment does not touch availability. The class already occupies the court
 * in `classesOn`, whether nine children turn up or none, so signing somebody up
 * changes what the desk knows and nothing about what /book can sell.
 */

import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { db, type Executor } from './db/client';
import { classEnrolments } from './db/schema';
import { classKey } from './schedule';

export type Enrolment = {
  id: number;
  date: string;
  court: number;
  start: number;
  className: string;
  name: string;
  phone: string;
  /** What the place cost on the day it was taken. 0 for a free session. */
  amount: number;
  paid: boolean;
};

/**
 * How many are signed up to each class on `date`, keyed by `classKey`.
 *
 * One grouped query for the whole day rather than one per class: the desk
 * draws up to four classes and asks this once.
 */
export async function enrolmentCounts(date: string): Promise<Record<string, number>> {
  const rows = await db
    .select({
      court: classEnrolments.courtId,
      start: classEnrolments.startMin,
      count: sql<number>`count(*)::int`,
    })
    .from(classEnrolments)
    .where(and(eq(classEnrolments.date, date), eq(classEnrolments.status, 'booked')))
    .groupBy(classEnrolments.courtId, classEnrolments.startMin);

  return Object.fromEntries(rows.map((r) => [classKey(r.court, r.start), r.count]));
}

/** Everyone signed up to one class, in the order they signed up. */
export async function classRoll(
  date: string,
  court: number,
  startMin: number,
): Promise<Enrolment[]> {
  const rows = await db
    .select()
    .from(classEnrolments)
    .where(
      and(
        eq(classEnrolments.date, date),
        eq(classEnrolments.courtId, court),
        eq(classEnrolments.startMin, startMin),
        eq(classEnrolments.status, 'booked'),
      ),
    )
    .orderBy(asc(classEnrolments.createdAt));

  return rows.map(toEnrolment);
}

/** The row, as everything above this file thinks of it. */
function toEnrolment(r: typeof classEnrolments.$inferSelect): Enrolment {
  return {
    id: r.id,
    date: r.date,
    court: r.courtId,
    start: r.startMin,
    className: r.className,
    name: r.name,
    phone: r.phone,
    amount: r.amount,
    paid: r.paid,
  };
}

export type EnrolInput = {
  date: string;
  court: number;
  start: number;
  className: string;
  name: string;
  phone?: string;
  /** From `fee` on the class's row in src/lib/schedule.ts. 0 if it is free. */
  amount?: number;
  /** Settled at the desk on the way in. */
  paid?: boolean;
};

/**
 * Sign a player up to a class.
 *
 * Returns null when that phone number already has a place: the desk taking the
 * same name twice is a slip, not something to record. A player with no number
 * on file is always added — see the note on `uniq_class_place`.
 */
export async function enrol(input: EnrolInput): Promise<Enrolment | null> {
  const [row] = await db
    .insert(classEnrolments)
    .values({
      date: input.date,
      courtId: input.court,
      startMin: input.start,
      className: input.className,
      name: input.name.trim(),
      phone: input.phone?.trim() ?? '',
      amount: input.amount ?? 0,
      paid: Boolean(input.paid),
    })
    .onConflictDoNothing()
    .returning();

  return row ? toEnrolment(row) : null;
}

export async function getEnrolment(id: number, tx: Executor = db): Promise<Enrolment | null> {
  const [row] = await tx
    .select()
    .from(classEnrolments)
    .where(eq(classEnrolments.id, id))
    .limit(1);
  return row ? toEnrolment(row) : null;
}

/**
 * Mark a class place settled up. Mirrors `markPaid` on a booking, executor
 * and all, so that paying for a class online is one transaction with the
 * payment that bought it.
 */
export async function markEnrolmentPaid(id: number, tx: Executor = db): Promise<boolean> {
  const rows = await tx
    .update(classEnrolments)
    .set({ paid: true })
    .where(and(eq(classEnrolments.id, id), eq(classEnrolments.status, 'booked')))
    .returning({ id: classEnrolments.id });

  return rows.length > 0;
}

/**
 * Take a player back off a class. The row is kept and marked, the way a
 * cancelled booking is — a place that was given up is part of the record.
 */
export async function unenrol(id: number): Promise<boolean> {
  const rows = await db
    .update(classEnrolments)
    .set({ status: 'cancelled' })
    .where(and(eq(classEnrolments.id, id), eq(classEnrolments.status, 'booked')))
    .returning({ id: classEnrolments.id });

  return rows.length > 0;
}

/**
 * Class places over a window, counted.
 *
 * The third register of who has been on court, alongside the attendance
 * rows and the bookings — see `bookingTotals` in src/lib/bookings.ts for
 * why none of the three can stand in for the others. Cancelled places fall
 * out: a place given up is part of the record, but nobody played on it.
 */
export type EnrolmentTotals = {
  from: string;
  to: string;
  /** Places taken. Somebody in two classes is two places. */
  places: number;
  /** Distinct phone numbers among them. */
  people: number;
  /** Places with no number on file, so outside `people`. */
  anonymous: number;
  /** Distinct runnings of a class — date, court and start time. */
  sessions: number;
  /** Shillings, split by whether the money has actually come in. */
  paid: number;
  unpaid: number;
};

export async function enrolmentTotals(from: string, to: string): Promise<EnrolmentTotals> {
  const [row] = await db
    .select({
      places: sql<number>`count(*)::int`,
      people: sql<number>`count(distinct ${classEnrolments.phone}) filter (
        where ${classEnrolments.phone} <> '')::int`,
      anonymous: sql<number>`count(*) filter (where ${classEnrolments.phone} = '')::int`,
      sessions: sql<number>`count(distinct (
        ${classEnrolments.date}, ${classEnrolments.courtId}, ${classEnrolments.startMin}))::int`,
      paid: sql<number>`coalesce(sum(${classEnrolments.amount}) filter (
        where ${classEnrolments.paid}), 0)::int`,
      unpaid: sql<number>`coalesce(sum(${classEnrolments.amount}) filter (
        where not ${classEnrolments.paid}), 0)::int`,
    })
    .from(classEnrolments)
    .where(
      and(
        gte(classEnrolments.date, from),
        lte(classEnrolments.date, to),
        eq(classEnrolments.status, 'booked'),
      ),
    );

  return {
    from,
    to,
    places: row?.places ?? 0,
    people: row?.people ?? 0,
    anonymous: row?.anonymous ?? 0,
    sessions: row?.sessions ?? 0,
    paid: row?.paid ?? 0,
    unpaid: row?.unpaid ?? 0,
  };
}
