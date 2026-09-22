/**
 * The roster — members, their memberships, and who has been on court.
 *
 * `attendance_report` is the tool that needs a word of explanation, because
 * "how many people came between these dates?" is a question the club can
 * answer three separate ways and none of them is the whole truth:
 *
 *   the register     — rows the desk wrote by hand. Names, exact, and only
 *                      as complete as the desk was diligent.
 *   court bookings   — slots sold. A booking is one row whether one person
 *                      turned up or four, and it is keyed by whatever number
 *                      the booker gave, so members with no number on file
 *                      are invisible to it.
 *   class places     — the same, for the weekly sessions.
 *
 * So the tool returns all three, each labelled, and says plainly that they
 * overlap. Adding them up would produce a confident number that is wrong;
 * picking one silently would answer a different question than the one asked.
 * See the note at the top of src/lib/attendance.ts for why the register
 * exists alongside the other two at all.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { attendedBetween, isOnRoster, recentFor, recordAttendance } from '@/lib/attendance';
import { bookingTotals } from '@/lib/bookings';
import { enrolmentTotals } from '@/lib/enrolments';
import { MEMBERSHIPS, MEMBERSHIP_TIERS, lapses } from '@/lib/pricing';
import {
  createPlayer,
  deactivatePlayer,
  dueBy,
  getPlayer,
  lastPlayedByPhone,
  listPlayers,
  markMembershipPaid,
  setLevel,
  updatePlayer,
  type PlayerRow,
} from '@/lib/players';
import { AVAILABILITIES, LEVELS, PLAYER_ROLES, isJunior, normalisePhone } from '@/lib/roster';
import { addDays, nowLocal } from '@/lib/time';

import { badWindow, dateWindow, fail, isoDate, ok } from '../reply';

const membership = z.enum(MEMBERSHIPS);
const level = z.enum(LEVELS);

export function registerRosterTools(server: McpServer) {
  server.registerTool(
    'list_players',
    {
      title: 'The roster',
      description:
        'Everybody still at the club, alphabetically, with their membership, level, when they ' +
        'last played and whether their term has run out. Filter by role, membership tier, ' +
        'level, availability, junior status, or whether they are overdue.',
      inputSchema: {
        role: z.enum(PLAYER_ROLES).optional().describe('member or coach.'),
        membership: membership.optional().describe('Only this tier.'),
        level: level.optional().describe('Only players on this rung of the ladder.'),
        unassessed: z.boolean().optional().describe('Only players with no level set yet.'),
        availability: z.enum(AVAILABILITIES).optional().describe('Only players who said this.'),
        juniors: z.boolean().optional().describe('True for under-18s only, false for adults only.'),
        overdue: z
          .boolean()
          .optional()
          .describe('True for members whose term has run out. Pay-as-you-play has no term and never appears.'),
        search: z.string().optional().describe('Match on name or phone number.'),
        limit: z.number().int().min(1).max(500).default(100).describe('How many to return.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const today = nowLocal().date;
      const [rows, lastPlayed] = await Promise.all([listPlayers(), lastPlayedByPhone(today)]);
      const needle = args.search?.trim().toLowerCase();

      const matched = rows.filter((p) => {
        if (args.role && p.role !== args.role) return false;
        if (args.membership && p.membership !== args.membership) return false;
        if (args.level && p.level !== args.level) return false;
        if (args.unassessed !== undefined && (p.level === null) !== args.unassessed) return false;
        if (args.availability && p.availability !== args.availability) return false;
        if (args.juniors !== undefined && isJunior(p.birthYear, today) !== args.juniors) return false;
        if (args.overdue !== undefined && isOverdue(p, today) !== args.overdue) return false;
        if (needle && !`${p.name} ${p.phone}`.toLowerCase().includes(needle)) return false;
        return true;
      });

      return ok({
        total: matched.length,
        returned: Math.min(matched.length, args.limit),
        players: matched.slice(0, args.limit).map((p) => ({
          ...describePlayer(p, today),
          lastPlayed: p.phone ? (lastPlayed[p.phone] ?? null) : null,
          // Said out loud, because a blank date here means "no number to
          // join on", not "has not played".
          lastPlayedKnown: Boolean(p.phone),
        })),
      });
    },
  );

  server.registerTool(
    'get_player',
    {
      title: 'One member',
      description:
        'A member in full, with the days the desk marked them present and when a booking or a ' +
        'class last put them on court. Nothing links a booking to a member row except the ' +
        'phone number, so a member with no number on file has no bookings history the club can see.',
      inputSchema: {
        playerId: z.number().int().positive().describe('The player id.'),
        recentDays: z.number().int().min(1).max(50).default(10).describe('How many attendance days to list.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ playerId, recentDays }) => {
      const today = nowLocal().date;
      const player = await getPlayer(playerId);
      if (!player) return fail(`No active player with id ${playerId}.`);

      const [days, lastPlayed] = await Promise.all([
        recentFor(playerId, recentDays),
        lastPlayedByPhone(today),
      ]);

      return ok({
        ...describePlayer(player, today),
        attendanceDays: days,
        lastPlayed: player.phone ? (lastPlayed[player.phone] ?? null) : null,
        lastPlayedKnown: Boolean(player.phone),
      });
    },
  );

  server.registerTool(
    'add_player',
    {
      title: 'Add a member',
      description:
        'Put somebody on the roster. A phone number is optional — the desk signs people up off ' +
        'a paper list — but without one the club cannot match their bookings to them or send ' +
        'them a renewal link. Refused if that number is already a live member.',
      inputSchema: {
        name: z.string().min(2).max(80).describe('Their name.'),
        phone: z.string().default('').describe('Tanzanian mobile, or empty for none on file.'),
        email: z.string().optional(),
        role: z.enum(PLAYER_ROLES).default('member').describe('A coach is staff: on the roster, off the ladder.'),
        membership: membership.default('monthly').describe('Which tier they are joining on.'),
        level: level.optional().describe('Only if they have actually been assessed. Leave unset otherwise.'),
        birthYear: z.number().int().min(1900).max(2100).optional().describe('Year only — under 18 makes them a junior.'),
        guardianName: z.string().optional().describe('Required in practice for a junior.'),
        guardianPhone: z.string().optional(),
        paidUntilToday: z
          .boolean()
          .default(false)
          .describe('They paid on the way in: start their term from today. Ignored for pay-as-you-play, which has no term.'),
        availability: z.enum(AVAILABILITIES).default('open'),
        notes: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => {
      const today = nowLocal().date;

      const phone = normalisePhone(args.phone);
      if (phone === null) return fail(`"${args.phone}" is not a Tanzanian mobile number.`);

      const guardianPhone = args.guardianPhone ? normalisePhone(args.guardianPhone) : '';
      if (guardianPhone === null) return fail(`"${args.guardianPhone}" is not a Tanzanian mobile number.`);

      const created = await createPlayer(
        {
          name: args.name,
          phone,
          email: args.email ?? null,
          role: args.role,
          level: args.level ?? null,
          birthYear: args.birthYear ?? null,
          guardianName: args.guardianName ?? null,
          guardianPhone: guardianPhone || null,
          membership: args.membership,
          availability: args.availability,
          notes: args.notes ?? null,
        },
        today,
      );

      if (!created) {
        return fail(`${phone} is already a live member.`, 'list_players with search set to that number will find them.');
      }

      // Paying on the way in is a separate write, so that the term is
      // advanced by the same rule every other payment uses rather than by a
      // date computed here.
      const settled =
        args.paidUntilToday && lapses(created.membership)
          ? await markMembershipPaid(created.id, today)
          : created;

      return ok(describePlayer(settled ?? created, today));
    },
  );

  server.registerTool(
    'update_player',
    {
      title: 'Change a member\'s details',
      description:
        'Edit a member. Level is handled separately from the rest because it is the only ' +
        'field that keeps history — the old level is kept and the day stamped, which is what ' +
        'makes "moved up a level this month" answerable. Pass level: null to un-assess somebody.',
      inputSchema: {
        playerId: z.number().int().positive().describe('The player id.'),
        name: z.string().min(2).max(80).optional(),
        phone: z.string().optional().describe('Tanzanian mobile, or "" to clear it.'),
        email: z.string().nullable().optional(),
        membership: membership.optional(),
        availability: z.enum(AVAILABILITIES).optional(),
        notes: z.string().nullable().optional(),
        level: level.nullable().optional().describe('Their new rung, or null to clear it.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ playerId, level: newLevel, ...patch }) => {
      const today = nowLocal().date;

      if (patch.phone !== undefined) {
        const phone = normalisePhone(patch.phone);
        if (phone === null) return fail(`"${patch.phone}" is not a Tanzanian mobile number.`);
        patch.phone = phone;
      }

      const hasPatch = Object.values(patch).some((v) => v !== undefined);
      let player = hasPatch ? await updatePlayer(playerId, patch) : await getPlayer(playerId);
      if (!player) return fail(`No active player with id ${playerId}.`);

      if (newLevel !== undefined) {
        player = (await setLevel(playerId, newLevel, today)) ?? player;
      }

      return ok(describePlayer(player, today));
    },
  );

  server.registerTool(
    'remove_player',
    {
      title: 'Take a member off the roster',
      description:
        'Deactivate a member. The row stays — a past member is still the name against last ' +
        'season\'s bookings — and their phone number is freed, so the same person can be ' +
        'signed up again later. Nothing is deleted.',
      inputSchema: {
        playerId: z.number().int().positive().describe('The player id.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ playerId }) => {
      const player = await getPlayer(playerId);
      if (!player) return fail(`No active player with id ${playerId}.`);

      const done = await deactivatePlayer(playerId);
      return done
        ? ok({ playerId, name: player.name, removed: true })
        : fail(`${player.name} is already off the roster.`);
    },
  );

  server.registerTool(
    'memberships_due',
    {
      title: 'Whose membership has run out',
      description:
        'Members whose term runs out on or before a date, soonest first — the renewal chase ' +
        'list. Only tiers with a term appear: pay-as-you-play never falls due, which is the ' +
        'point of it. send_payment_link is how one of these is actually chased.',
      inputSchema: {
        through: isoDate
          .optional()
          .describe('Include anyone due on or before this date. Defaults to today at the club.'),
        withinDays: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Alternative to "through": anyone due in the next N days. 0 is today.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ through, withinDays }) => {
      const today = nowLocal().date;
      const cutoff = through ?? (withinDays === undefined ? today : addDays(today, withinDays));

      const rows = await dueBy(cutoff);
      return ok({
        through: cutoff,
        today,
        count: rows.length,
        players: rows.map((p) => ({
          ...describePlayer(p, today),
          fee: MEMBERSHIP_TIERS[p.membership].fee,
          reachable: Boolean(p.phone),
        })),
      });
    },
  );

  server.registerTool(
    'take_membership_payment',
    {
      title: 'Record a membership payment at the desk',
      description:
        'Money over the counter. Advances the member\'s term from whichever is later — today, ' +
        'or the day their current term runs out — so paying early extends rather than resets, ' +
        'and somebody who lapsed months ago starts fresh rather than buying back time they ' +
        'did not use. For money that has not been collected yet, use send_payment_link instead.',
      inputSchema: {
        playerId: z.number().int().positive().describe('The player id.'),
        tier: membership
          .optional()
          .describe(
            'The tier that was paid for, if it differs from the tier on their row. The money ' +
              'decides the term, not the row.',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ playerId, tier }) => {
      const today = nowLocal().date;
      const before = await getPlayer(playerId);
      if (!before) return fail(`No active player with id ${playerId}.`);

      if (!lapses(tier ?? before.membership)) {
        return fail(
          `${MEMBERSHIP_TIERS[tier ?? before.membership].label} has no term, so there is nothing to extend.`,
          'Pay-as-you-play is charged per booking. Mark the booking paid with update_booking instead.',
        );
      }

      const after = await markMembershipPaid(playerId, today, { tier });
      if (!after) return fail(`Could not take a payment for player ${playerId}.`);

      return ok({
        ...describePlayer(after, today),
        paidFor: tier ?? before.membership,
        amount: MEMBERSHIP_TIERS[tier ?? before.membership].fee,
        termWas: before.paidUntil,
        termNow: after.paidUntil,
      });
    },
  );

  server.registerTool(
    'record_attendance',
    {
      title: 'Mark a member present',
      description:
        'Write one day into the attendance register. One row per player per day — marking the ' +
        'same player on the same day twice is absorbed rather than refused, and reported as ' +
        '"already recorded". This changes what the roster says about them and nothing about ' +
        'what the booking page can sell for that day.',
      inputSchema: {
        playerId: z.number().int().positive().describe('The player id.'),
        date: isoDate.optional().describe('The day they played. Defaults to today at the club.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ playerId, date }) => {
      const today = nowLocal().date;
      const day = date ?? today;

      if (!(await isOnRoster(playerId))) return fail(`No active player with id ${playerId}.`);
      if (day > today) return fail(`${day} is in the future — attendance is a record of the past.`);

      const written = await recordAttendance(playerId, day);
      return ok({ playerId, date: day, recorded: written, alreadyRecorded: !written });
    },
  );

  server.registerTool(
    'attendance_report',
    {
      title: 'How many people were on court',
      description:
        'Who came, over a window. The club records this three ways and they overlap, so all ' +
        'three are returned separately rather than being added up: the attendance register ' +
        '(desk-written, names, exact), court bookings (slots sold — one row however many ' +
        'played, and keyed by phone number so members with none on file are invisible), and ' +
        'class places. Read "register" for named members and "bookings" for court traffic.',
      inputSchema: dateWindow,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ from, to }) => {
      const bad = badWindow(from, to);
      if (bad) return bad;

      const [register, courts, classes] = await Promise.all([
        attendedBetween(from, to),
        bookingTotals(from, to),
        enrolmentTotals(from, to),
      ]);

      return ok({
        from,
        to,
        register: {
          what: 'Days the desk marked a member present. Named and exact, but only as complete as the desk was.',
          people: register.players,
          playerDays: register.days,
          byDate: register.byDate,
          byPlayer: register.byPlayer,
        },
        bookings: {
          what: 'Court slots sold. One booking is one row whether one person turned up or four.',
          bookings: courts.bookings,
          distinctNumbers: courts.people,
          bookingsWithNoNumber: courts.anonymous,
          coached: courts.coached,
          courtHours: courts.courtHours,
        },
        classes: {
          what: 'Places taken in the weekly sessions.',
          places: classes.places,
          distinctNumbers: classes.people,
          placesWithNoNumber: classes.anonymous,
          sessionsRun: classes.sessions,
        },
        caution:
          'These three overlap — a member marked present may also hold a booking and a class ' +
          'place that day — so do not add them together. Say which register a figure came from.',
      });
    },
  );
}

/** Has their term run out? Only a tier with a term can have. */
function isOverdue(p: PlayerRow, today: string): boolean {
  return lapses(p.membership) && (p.paidUntil === null || p.paidUntil < today);
}

/** One member, with the two things a row does not say outright. */
function describePlayer(p: PlayerRow, today: string) {
  return {
    id: p.id,
    name: p.name,
    phone: p.phone || null,
    email: p.email,
    role: p.role,
    level: p.level,
    previousLevel: p.previousLevel,
    levelSetAt: p.levelSetAt,
    membership: p.membership,
    membershipFee: MEMBERSHIP_TIERS[p.membership].fee,
    paidUntil: p.paidUntil,
    overdue: isOverdue(p, today),
    availability: p.availability,
    birthYear: p.birthYear,
    junior: isJunior(p.birthYear, today),
    guardianName: p.guardianName,
    guardianPhone: p.guardianPhone,
    wins: p.wins,
    losses: p.losses,
    joinedOn: p.joinedOn,
    notes: p.notes,
  };
}
