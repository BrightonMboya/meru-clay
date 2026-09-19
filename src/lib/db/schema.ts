/**
 * The database, in Drizzle.
 *
 * A port of migrations/0001_init.sql and 0002_coach.sql from SQLite to
 * Postgres. Two things changed in the crossing and nothing else did:
 *
 *   - SQLite's `INTEGER NOT NULL DEFAULT 0` booleans are real `boolean`s here.
 *   - Epoch-millisecond integers are `timestamptz`. Postgres has the type, and
 *     `expires_at > now()` is then a comparison the database can make on its
 *     own, which is what lets a hold expire inside a query.
 *
 * Minutes-from-local-midnight stay integers. See the note in src/lib/time.ts:
 * the club is in one fixed-offset timezone, so a slot is an integer and
 * comparing two slots is comparing two integers. Storing them as `time` would
 * buy nothing and cost the arithmetic.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const courts = pgTable('courts', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  floodlit: boolean('floodlit').notNull().default(false),
  active: boolean('active').notNull().default(true),
});

export const BOOKING_STATUSES = ['held', 'confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const ENROLMENT_STATUSES = ['booked', 'cancelled'] as const;
export type EnrolmentStatus = (typeof ENROLMENT_STATUSES)[number];

export const bookings = pgTable(
  'bookings',
  {
    id: text('id').primaryKey(),
    courtId: integer('court_id')
      .notNull()
      .references(() => courts.id),
    /** YYYY-MM-DD, local. `mode: 'string'` keeps it the string the rest of the app compares. */
    date: date('date', { mode: 'string' }).notNull(),
    /** Minutes from local midnight. */
    startMin: integer('start_min').notNull(),
    endMin: integer('end_min').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    notes: text('notes'),
    /** True when the player also booked the coach. */
    coach: boolean('coach').notNull().default(false),
    /**
     * 'held'      — slot reserved, awaiting payment/confirmation
     * 'confirmed' — slot is theirs
     * 'cancelled' — released, kept for the record
     */
    status: text('status').notNull().default('held').$type<BookingStatus>(),
    /** When a 'held' booking dies. NULL once confirmed. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Set when the hold was promoted. */
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    /** Whether the player has settled up. The desk chases the ones that haven't. */
    paid: boolean('paid').notNull().default(false),
    amount: integer('amount').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * The authoritative guard against double-booking. A court/date/start can be
     * claimed by at most one live booking; cancelled rows are excluded so a
     * released slot can be resold.
     *
     * Availability queries are advisory — THIS is what decides. It only catches
     * identical start times, so `createBooking` pairs it with an overlap check
     * inside the same transaction: a 90-minute booking at 17:00 also has to
     * lose to a 60-minute one already sitting at 17:30.
     */
    uniqueIndex('uniq_live_slot')
      .on(t.courtId, t.date, t.startMin)
      .where(sql`status in ('held', 'confirmed')`),
    index('idx_bookings_date').on(t.date, t.status),
    /** The coach can only be in one place at a time. See `occupancy`. */
    index('idx_bookings_coach')
      .on(t.date, t.coach)
      .where(sql`coach and status in ('held', 'confirmed')`),
    check('bookings_status_check', sql`status in ('held', 'confirmed', 'cancelled')`),
    check('bookings_span_check', sql`end_min > start_min`),
  ],
);

/** Ad-hoc court closures: maintenance, tournaments, resurfacing. */
export const blocks = pgTable(
  'blocks',
  {
    id: serial('id').primaryKey(),
    /** NULL closes every court. */
    courtId: integer('court_id').references(() => courts.id),
    date: date('date', { mode: 'string' }).notNull(),
    startMin: integer('start_min').notNull(),
    endMin: integer('end_min').notNull(),
    reason: text('reason'),
  },
  (t) => [index('idx_blocks_date').on(t.date)],
);

/**
 * Who is signed up to a club class.
 *
 * A class has no row of its own — the weekly grid is code, in
 * src/lib/schedule.ts — so an enrolment names the occurrence it belongs to by
 * the only thing that identifies one: the court and start minute on a given
 * date. A court runs one class at a time, so that triple is the class.
 *
 * `class_name` is stored alongside it even though it is derivable, because it
 * is derivable only from today's timetable. Move the Tuesday clinic to 18:00
 * next season and every past enrolment would otherwise start describing a
 * class nobody attended.
 */
export const classEnrolments = pgTable(
  'class_enrolments',
  {
    id: serial('id').primaryKey(),
    date: date('date', { mode: 'string' }).notNull(),
    courtId: integer('court_id')
      .notNull()
      .references(() => courts.id),
    /** Minutes from local midnight — the class's start, from the weekly grid. */
    startMin: integer('start_min').notNull(),
    /** What the class was called on the day they signed up. */
    className: text('class_name').notNull(),
    name: text('name').notNull(),
    /** Blank for a walk-in the desk took without one. */
    phone: text('phone').notNull().default(''),
    /** 'booked' or 'cancelled'. Cancellations are kept, like bookings. */
    status: text('status').notNull().default('booked').$type<EnrolmentStatus>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * One live place per phone number per class. Walk-ins with no number are
     * exempt — two of them are two different people, and refusing the second
     * would be worse than letting the desk see a duplicate.
     */
    uniqueIndex('uniq_class_place')
      .on(t.date, t.courtId, t.startMin, t.phone)
      .where(sql`status = 'booked' and phone <> ''`),
    index('idx_enrolments_date').on(t.date, t.status),
    check('enrolments_status_check', sql`status in ('booked', 'cancelled')`),
  ],
);

export type BookingRecord = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BlockRecord = typeof blocks.$inferSelect;
export type EnrolmentRecord = typeof classEnrolments.$inferSelect;
