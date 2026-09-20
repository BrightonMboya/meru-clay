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

import { relations, sql } from 'drizzle-orm';
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
  LEAD_SOURCES,
  LEAD_STAGES,
  MESSAGE_DIRECTIONS,
  MESSAGE_STATUSES,
  type LeadSource,
  type LeadStage,
  type MessageDirection,
  type MessageStatus,
} from '../pipeline';
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


/**
 * A lead — somebody who asked about the club and has not joined yet.
 *
 * Deliberately not a `players` row. A lead is an enquiry, most of which come
 * to nothing; a player is a member of the club. Collapsing the two would put
 * sixty maybes on the roster and make every count on that screen wrong. When
 * a lead does join, `player_id` is filled in and the two rows sit side by
 * side — the lead keeps the story of how they arrived, which is the only
 * record of what the advertising actually bought.
 *
 * The two timestamps at the bottom are not bookkeeping. `last_inbound_at` is
 * what WhatsApp's 24-hour rule is measured from, so it decides whether the
 * desk may type a free message or must fall back to an approved template —
 * see `replyWindow` in src/lib/pipeline.ts. It is written by the webhook, and
 * it is the single most load-bearing column on this table.
 */
export const leads = pgTable(
  'leads',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    /** E.164 (+255…) — this is the WhatsApp address, so it is required. */
    phone: text('phone').notNull(),
    email: text('email'),
    stage: text('stage').notNull().default('new').$type<LeadStage>(),
    source: text('source').notNull().default('other').$type<LeadSource>(),
    /** Which ad they came from — "ADULT BEGINNERS". Free text; Meta's names. */
    campaign: text('campaign'),
    /** Their own words, where the form captured them. */
    note: text('note'),
    /** Who at the club owns the conversation. */
    owner: text('owner'),
    /** Set when they join. The lead row is kept either way. */
    playerId: integer('player_id').references(() => players.id),
    /**
     * When they last wrote to us. NULL means they never have, which is the
     * normal state of a brand-new lead and the reason the first message out
     * must be a template. See the header note.
     */
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    lastOutboundAt: timestamp('last_outbound_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * One live lead per number, on the same reasoning as `uniq_player_phone`:
     * the same person filling in the Instagram form twice is one lead, not
     * two, and the desk should not have to spot it. Lost leads are exempt so
     * that somebody who went quiet in March can come back in September as a
     * fresh enquiry.
     */
    uniqueIndex('uniq_lead_phone')
      .on(t.phone)
      .where(sql`stage <> 'lost'`),
    index('idx_leads_stage').on(t.stage, t.createdAt),
    check('leads_stage_check', sql.raw(`stage in (${list(LEAD_STAGES)})`)),
    check('leads_source_check', sql.raw(`source in (${list(LEAD_SOURCES)})`)),
  ],
);

/**
 * Every message either way, and the club's own record of the conversation.
 *
 * Kept even though WhatsApp has its own copy, for three reasons: the desk can
 * read a lead's history without anyone's phone in hand, the timeline survives
 * a staff member leaving with their handset, and `wa_message_id` gives the
 * webhook something to be idempotent against. Meta retries deliveries, so the
 * same message WILL arrive twice; the unique index below is what makes that
 * harmless rather than a doubled conversation.
 */
export const leadMessages = pgTable(
  'lead_messages',
  {
    id: serial('id').primaryKey(),
    leadId: integer('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull().$type<MessageDirection>(),
    body: text('body').notNull(),
    /**
     * Meta's own id (`wamid.…`). NULL only for the instant between writing
     * the row and the API answering — and for rows a send never got an id
     * for, which is why the unique index below is partial.
     */
    waMessageId: text('wa_message_id'),
    /** The approved template used, or NULL for a freeform message. */
    template: text('template'),
    status: text('status').notNull().default('queued').$type<MessageStatus>(),
    /** Meta's complaint, when status is 'failed'. Shown to the desk verbatim. */
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** The webhook's idempotency. See the header note. */
    uniqueIndex('uniq_lead_message_wamid')
      .on(t.waMessageId)
      .where(sql`wa_message_id is not null`),
    index('idx_lead_messages_lead').on(t.leadId, t.createdAt),
    check('lead_messages_direction_check', sql.raw(`direction in (${list(MESSAGE_DIRECTIONS)})`)),
    check('lead_messages_status_check', sql.raw(`status in (${list(MESSAGE_STATUSES)})`)),
  ],
);

export type BookingRecord = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BlockRecord = typeof blocks.$inferSelect;
export type EnrolmentRecord = typeof classEnrolments.$inferSelect;
export type PlayerRecord = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type AttendanceRecord = typeof attendance.$inferSelect;
export type LeadRecord = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadMessageRecord = typeof leadMessages.$inferSelect;
export type NewLeadMessage = typeof leadMessages.$inferInsert;

/**
 * Better Auth.
 *
 * Four tables, and none of them are ours to design: Better Auth queries them
 * by name and by column, so these definitions have to match what the library
 * expects or sign-in fails at runtime rather than at build time. They were
 * produced by `npx auth generate` and then moved here by hand.
 *
 * That makes upgrades the thing to watch. A new version of better-auth, or a
 * plugin added to src/lib/auth.ts, can want columns that are not here yet.
 * To see what a given version wants:
 *
 *     npx auth generate --config src/lib/auth.ts --output /tmp/auth-schema.ts
 *
 * and diff it against this block. Nothing warns you otherwise.
 *
 * The timestamps below are `timestamp`, not the `timestamptz` used everywhere
 * above. That is what the generator emits and what migration 0008 created, so
 * it stays — the mismatch is worth knowing about, not worth a type change the
 * next `auth generate` would disagree with.
 */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * One row per signed-in browser. `token` is what the session cookie carries,
 * so it is unique and looked up on essentially every authenticated request.
 */
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$onUpdate(() => new Date()),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_userId_idx').on(t.userId)],
);

/**
 * Credentials. For email-and-password sign-in this holds the password hash
 * and `providerId` is 'credential'; for a social provider it holds that
 * provider's tokens instead. A user can have several.
 */
export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('account_userId_idx').on(t.userId)],
);

/** Short-lived tokens: email verification, password reset. */
export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

/**
 * Invitations to the club office.
 *
 * This table is the answer to "who is allowed to become an operator". Signup
 * is otherwise closed once the founding account exists (see
 * `user.validateUserInfo` in src/lib/auth.ts), and a row here is the single
 * exception — an email the club has deliberately asked in.
 *
 * It is not the magic link. Better Auth mints and verifies the link itself,
 * through the `verification` table above, and those tokens last minutes. This
 * lasts days and answers a different question: not "is this link genuine" but
 * "was this person invited at all". Both have to be true to get in, which is
 * what stops a link forwarded to a stranger from also handing them an account.
 *
 * One row per email: inviting the same address twice refreshes the existing
 * invitation rather than stacking up duplicates. Revoking deletes the row.
 */
export const adminInvites = pgTable(
  'admin_invites',
  {
    id: serial('id').primaryKey(),
    /** Lowercased on the way in — see `normaliseEmail` in src/lib/admin/invites.ts. */
    email: text('email').notNull(),
    /**
     * Who asked them. Null once that operator's own account is deleted: the
     * invitation still happened, and losing the record of it would be worse
     * than losing the name attached to it.
     */
    invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
    /** Their name at the time of inviting, so the roll reads as people. */
    invitedByName: text('invited_by_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Past this, the row no longer admits anyone. Re-invite to extend. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set when the account is actually created. Null while outstanding. */
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('uniq_admin_invite_email').on(t.email)],
);

export type AdminInviteRecord = typeof adminInvites.$inferSelect;

export type UserRecord = typeof user.$inferSelect;
export type SessionRecord = typeof session.$inferSelect;
