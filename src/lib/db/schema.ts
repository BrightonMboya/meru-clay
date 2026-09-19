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

import { MEMBERSHIPS, type MembershipTier } from '../pricing';
import {
  AVAILABILITIES,
  LEVELS,
  PLAYER_ROLES,
  type Level,
  type PlayerAvailability,
  type PlayerRole,
} from '../roster';

/** `'a', 'b'` — the club's vocabularies, as a CHECK constraint's list. */
const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

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

/**
 * Everybody at the club — members and coaches, one row each.
 *
 * The roster screen is built entirely from this table plus what the bookings
 * and enrolments tables already know, and the split between the two is worth
 * stating because it decides where every column here stops:
 *
 *   STORED — what somebody at the desk had to be told. Their name, their
 *   number, the level a coach assessed them at, which membership they pay,
 *   when they last paid, when they are willing to play.
 *
 *   DERIVED — everything a query can answer. How many members there are, how
 *   the club spreads across the levels, who is overdue, when a player last
 *   set foot on a court. None of it is a column; see src/lib/admin/players.ts.
 *
 * Two columns look like exceptions and are not. `previous_level` and
 * `level_set_at` are the only history the table keeps, and they exist for one
 * screen element — "moved up a level this month" — which cannot be answered
 * from a current level alone. A third, `wins`/`losses`, is the ladder record
 * the match screens will maintain; it is here so the roster has somewhere to
 * read it from, and it stays at 0–0 until they do.
 */
export const players = pgTable(
  'players',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    /**
     * Empty means no number on file, which is a real state — the club signs
     * people up off a paper list at the gate. Stored E.164 (+255…).
     */
    phone: text('phone').notNull().default(''),
    email: text('email'),
    role: text('role').notNull().default('member').$type<PlayerRole>(),
    /** NULL until a coach has assessed them. See `MaybeLevel` in src/lib/roster.ts. */
    level: text('level').$type<Level>(),
    /** What they were before the current level, for "moved up a level". */
    previousLevel: text('previous_level').$type<Level>(),
    /** When the current level was set. NULL while unranked. */
    levelSetAt: date('level_set_at', { mode: 'string' }),
    /**
     * Year only. The club asks an age, not a birthday, and a year is all that
     * is needed to tell a junior from an adult — see `ageIn`.
     */
    birthYear: integer('birth_year'),
    guardianName: text('guardian_name'),
    guardianPhone: text('guardian_phone'),
    membership: text('membership').notNull().default('monthly').$type<MembershipTier>(),
    /**
     * Paid up to and including this date. NULL means they have never paid, so
     * a new member is due from the moment they are added — which is the point:
     * the roster's clay number is the club's unbilled money.
     */
    paidUntil: date('paid_until', { mode: 'string' }),
    availability: text('availability')
      .notNull()
      .default('open')
      .$type<PlayerAvailability>(),
    /** The ladder record. Written by the match screens; 0–0 until then. */
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    joinedOn: date('joined_on', { mode: 'string' })
      .notNull()
      .default(sql`current_date`),
    /**
     * Left the club. Rows are never deleted — a past member is still the name
     * on last season's bookings and results.
     */
    active: boolean('active').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * One live row per number. The desk adding somebody who is already a
     * member is a slip, and the number is the only thing that can catch it —
     * two members really can be called John Massawe. Rows with no number are
     * exempt, for the same reason walk-ins are exempt from `uniq_class_place`.
     */
    uniqueIndex('uniq_player_phone')
      .on(t.phone)
      .where(sql`active and phone <> ''`),
    index('idx_players_active').on(t.active, t.role),
    check('players_role_check', sql.raw(`role in (${list(PLAYER_ROLES)})`)),
    check('players_level_check', sql.raw(`level is null or level in (${list(LEVELS)})`)),
    check(
      'players_previous_level_check',
      sql.raw(`previous_level is null or previous_level in (${list(LEVELS)})`),
    ),
    check('players_membership_check', sql.raw(`membership in (${list(MEMBERSHIPS)})`)),
    check('players_availability_check', sql.raw(`availability in (${list(AVAILABILITIES)})`)),
    check('players_record_check', sql`wins >= 0 and losses >= 0`),
  ],
);

/**
 * Who turned up, on what day.
 *
 * The roster already answers "when did they last play" — from confirmed
 * bookings and class places, both keyed by phone number. This table exists
 * for everybody that misses: the club signs people up off a paper list at the
 * gate, a third of the roster has no number on file, and those rows can never
 * acquire a playing history no matter how often they are on a court. A row
 * here is the desk saying so directly, and it points at a player rather than
 * a number, which is the whole reason it can.
 *
 * It records attendance, not a booking. Nothing here occupies a court or
 * changes what /book can sell; see `bookings` for the thing that does.
 */
export const attendance = pgTable(
  'attendance',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    date: date('date', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * One row per player per day. Somebody playing twice on a Saturday is
     * still one day of attendance, and recording it twice is a slip the desk
     * should not have to notice — the insert absorbs it.
     */
    uniqueIndex('uniq_attendance_day').on(t.playerId, t.date),
    index('idx_attendance_date').on(t.date),
  ],
);

export type BookingRecord = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BlockRecord = typeof blocks.$inferSelect;
export type EnrolmentRecord = typeof classEnrolments.$inferSelect;
export type PlayerRecord = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type AttendanceRecord = typeof attendance.$inferSelect;
