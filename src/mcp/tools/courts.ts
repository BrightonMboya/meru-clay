/**
 * The courts — what is free, what is booked, and closing one.
 *
 * These tools are the desk's timeline and booking form, reached over MCP
 * instead of by mouse. They deliberately behave like the desk and not like
 * /book:
 *
 *   - No hour of notice. /book's notice window stops a player buying a court
 *     they cannot reach in time; somebody the office is booking for is on the
 *     phone now. `court_availability` takes `respectNotice` for the rare case
 *     the caller wants the public rule applied.
 *   - No hold. The row goes in confirmed with no expiry, because there is
 *     nobody to confirm it later.
 *
 * What they do NOT relax is what is actually in the way. Every booking here
 * is checked against the same occupancy /book is — other bookings, the class
 * timetable, and any closure the desk has drawn — and `createBooking` takes
 * the same advisory lock and overlap test underneath. A model cannot book
 * over a class through this file, and a refusal says which of the three is
 * in the way rather than just saying no.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  COURTS,
  conflictAt,
  courtName,
  earliestStart,
  freeSlots,
  isValidStart,
  lastPlay,
  occupancy,
} from '@/lib/availability';
import { createBlock, deleteBlock, deskBlocks, validBlockWindow } from '@/lib/blocks';
import {
  blocksOn,
  bookingByReference,
  bookingTotals,
  cancelBooking,
  confirmBooking,
  createBooking,
  deskBookings,
  hoursByDate,
  liveBookings,
  markPaid,
  owedOnCourts,
  type DeskBooking,
} from '@/lib/bookings';
import { totalFor } from '@/lib/pricing';
import { normalisePhone } from '@/lib/roster';
import { DURATIONS, OPEN_MIN, addDays, nowLocal, type Duration } from '@/lib/time';

import { badWindow, clockTime, dateWindow, fail, isoDate, minutesOf, ok, timeOf } from '../reply';

/** The id of a real court, as an argument. */
const courtId = z
  .number()
  .int()
  .refine(
    (id) => COURTS.some((c) => c.id === id),
    `Court must be one of ${COURTS.map((c) => `${c.id} (${c.name})`).join(', ')}.`,
  );

const duration = z
  .number()
  .int()
  .refine((d) => (DURATIONS as readonly number[]).includes(d), `Duration must be ${DURATIONS.join(' or ')} minutes.`);

export function registerCourtTools(server: McpServer) {
  server.registerTool(
    'court_availability',
    {
      title: 'What is free on a court',
      description:
        'Free start times on a date, per court, for a booking of the given length. Subtracts ' +
        'everything that occupies a court: live bookings, the weekly class timetable, and any ' +
        'closure the desk has drawn. Set withCoach to also require the coach free — there is ' +
        'one, so anything they are already running rules out that time on both courts.',
      inputSchema: {
        date: isoDate.describe('The day to look at (YYYY-MM-DD).'),
        durationMinutes: duration.default(60).describe('How long the booking is.'),
        withCoach: z
          .boolean()
          .default(false)
          .describe('Require the coach to be free as well, not just the court.'),
        respectNotice: z
          .boolean()
          .default(false)
          .describe(
            'Apply the public booking page\'s one hour of notice. False (the default) is the ' +
              'desk rule: a slot starting in ten minutes is offerable to somebody on the phone.',
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ date, durationMinutes, withCoach, respectNotice }) => {
      const now = nowLocal();
      const [bookings, blocks] = await Promise.all([liveBookings(date, now.epochMs), blocksOn(date)]);

      const occupied = occupancy(date, bookings, blocks, { withCoach });
      const minStart = respectNotice ? earliestStart(date, 60, now) : date < now.date ? Infinity : OPEN_MIN;
      const slots = freeSlots(durationMinutes as Duration, occupied, minStart);

      return ok({
        date,
        durationMinutes,
        withCoach,
        price: totalFor(durationMinutes as Duration, withCoach),
        // A past day offers nothing, which would otherwise read as "fully
        // booked". create_booking will still take one — the desk sometimes
        // has to write up a court that was played and never recorded.
        ...(date < now.date
          ? { note: `${date} is in the past, so nothing is offerable. create_booking will still accept it, for writing up a court that was played but never recorded.` }
          : {}),
        free: COURTS.map((court) => ({
          court: court.id,
          name: court.name,
          floodlit: court.floodlit,
          starts: slots.filter((s) => s.court === court.id).map((s) => timeOf(s.start)),
        })),
        occupied: occupied
          .map((o) => ({
            court: o.court,
            from: timeOf(o.start),
            to: timeOf(o.end),
            reason: o.reason,
          }))
          .sort((a, b) => a.court - b.court || a.from.localeCompare(b.from)),
      });
    },
  );

  server.registerTool(
    'list_bookings',
    {
      title: 'The day at the courts',
      description:
        'Every booking on a date as the desk sees it — who, when, which court, whether the ' +
        'coach is in, whether it is paid — plus any closures drawn over that day. Cancelled ' +
        'bookings and lapsed holds are left out: they no longer own their slot.',
      inputSchema: {
        date: isoDate.describe('The day to list (YYYY-MM-DD).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ date }) => {
      const now = nowLocal();
      const [rows, closures] = await Promise.all([deskBookings(date, now.epochMs), deskBlocks(date)]);

      return ok({
        date,
        bookings: rows.map(describeBooking),
        closures: closures.map((c) => ({
          id: c.id,
          court: c.court_id,
          courtName: c.court_id == null ? 'Both courts' : courtName(c.court_id),
          from: timeOf(c.start_min),
          to: timeOf(c.end_min),
          reason: c.reason,
        })),
        totals: {
          bookings: rows.length,
          courtHours: rows.reduce((n, r) => n + (r.end_min - r.start_min), 0) / 60,
          unpaid: rows.filter((r) => !r.paid).reduce((n, r) => n + r.amount, 0),
        },
      });
    },
  );

  server.registerTool(
    'get_booking',
    {
      title: 'One booking',
      description: 'A single booking in full, by its id or by the 8-character reference the desk quotes.',
      inputSchema: {
        id: z.string().min(8).describe('The booking id, or its first 8 characters.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const found = await resolve(id);
      if ('error' in found) return found.error;
      return ok(describeBooking(found.booking));
    },
  );

  server.registerTool(
    'create_booking',
    {
      title: 'Book a court',
      description:
        'Take a booking at the desk — a walk-in or a phone call. Goes in confirmed with no ' +
        'hold, because the player is already talking to somebody. Refused, with the reason, ' +
        'if a booking, a class or a closure is in the way. Check court_availability first.',
      inputSchema: {
        court: courtId.describe('Which court.'),
        date: isoDate.describe('The day (YYYY-MM-DD).'),
        start: clockTime.describe('Start time, on the 30-minute grid, e.g. "18:30".'),
        durationMinutes: duration.default(60).describe('How long.'),
        name: z.string().min(2).max(80).describe('Who the court is for.'),
        phone: z
          .string()
          .default('')
          .describe(
            'Their number. Tanzanian mobile, any of 0…, +255… or 255…. May be left empty — ' +
              'the desk often has only a first name — but then the club cannot reach them.',
          ),
        withCoach: z.boolean().default(false).describe('They booked the coach too.'),
        paid: z.boolean().default(false).describe('They settled up at the counter there and then.'),
        notes: z.string().max(300).optional().describe('Anything the desk should remember.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ court, date, start, durationMinutes, name, phone, withCoach, paid, notes }) => {
      const startMin = minutesOf(start);
      if (!isValidStart(startMin, durationMinutes, court)) {
        return fail(
          `${start} is not a bookable start for ${durationMinutes} minutes on ${courtName(court)}.`,
          `Starts land on the 30-minute grid and play must finish by ${timeOf(lastPlay(court))} on that court.`,
        );
      }

      const normalised = normalisePhone(phone);
      if (normalised === null) return fail(`"${phone}" is not a Tanzanian mobile number.`);

      const now = nowLocal();
      const [dayBookings, dayBlocks] = await Promise.all([
        liveBookings(date, now.epochMs),
        blocksOn(date),
      ]);

      // Say what is in the way, rather than refusing without a reason.
      const blocking = conflictAt(
        court,
        startMin,
        startMin + durationMinutes,
        occupancy(date, dayBookings, dayBlocks, { withCoach }),
      );
      if (blocking) {
        return fail(
          `${courtName(court)} is not free at ${start} on ${date} — ${blocking.toLowerCase()}.`,
          'court_availability lists what is still open that day.',
        );
      }

      const result = await createBooking(
        {
          court,
          date,
          start: startMin,
          duration: durationMinutes,
          name,
          phone: normalised,
          email: null,
          notes: notes?.trim() || null,
          coach: withCoach,
          confirmed: true,
          paid,
        },
        now.epochMs,
      );

      // Somebody claimed it between the check above and the write.
      if (!result.ok) {
        const open = freeSlots(
          durationMinutes as Duration,
          occupancy(date, await liveBookings(date, now.epochMs), dayBlocks, { withCoach }),
        );
        return fail(
          'Somebody claimed that slot while this booking was being written.',
          open.length === 0
            ? 'Nothing else is free that day at that length.'
            : `Still free: ${open.map((s) => `${courtName(s.court)} ${timeOf(s.start)}`).join(', ')}.`,
        );
      }

      const booking = result.booking;
      return ok({
        id: booking.id,
        reference: booking.id.slice(0, 8),
        court: booking.court_id,
        courtName: courtName(booking.court_id),
        date: booking.date,
        from: timeOf(booking.start_min),
        to: timeOf(booking.end_min),
        name: booking.name,
        phone: booking.phone || null,
        withCoach: Boolean(booking.coach),
        status: booking.status,
        paid,
        price: totalFor(durationMinutes as Duration, withCoach),
      });
    },
  );

  server.registerTool(
    'update_booking',
    {
      title: 'Confirm, cancel or settle a booking',
      description:
        'The four decisions the desk makes about a booking. "confirm" promotes a hold once ' +
        'the coach has said yes; "cancel" releases the slot back onto the booking page; ' +
        '"paid" and "unpaid" record whether the money came in. A no-op is reported honestly — ' +
        'confirming a hold that has already lapsed is refused rather than shrugged at.',
      inputSchema: {
        id: z.string().min(8).describe('The booking id, or its first 8 characters.'),
        action: z
          .enum(['confirm', 'cancel', 'paid', 'unpaid'])
          .describe('What to do with it.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id, action }) => {
      const found = await resolve(id);
      if ('error' in found) return found.error;
      const before = found.booking;

      const done = await (action === 'confirm'
        ? confirmBooking(before.id)
        : action === 'cancel'
          ? cancelBooking(before.id)
          : markPaid(before.id, action === 'paid'));

      if (!done) {
        return fail(
          `That booking is ${before.status}${before.paid ? ' and paid' : ''}, so "${action}" changes nothing.`,
        );
      }

      const after = await bookingByReference(before.id);
      return ok({
        action,
        booking: after && 'booking' in after ? describeBooking(after.booking) : null,
        // A cancelled booking somebody has already paid for is money the
        // club owes back, and nothing else in the system will say so.
        ...(action === 'cancel' && before.paid ? { refundDue: before.amount } : {}),
      });
    },
  );

  server.registerTool(
    'close_court',
    {
      title: 'Take a court off the market',
      description:
        'Close a court for part of a day — rain, resurfacing, a tournament, a private hire ' +
        'taken by phone. The start times disappear from the booking page immediately. ' +
        'Bookings already taken are NOT cancelled: they stay sold and stay on the timeline ' +
        'so somebody can phone the player. Pass court: null to close both.',
      inputSchema: {
        court: courtId.nullable().describe('Which court, or null for both.'),
        date: isoDate.describe('The day (YYYY-MM-DD).'),
        from: clockTime.describe('When the closure starts, e.g. "13:00".'),
        to: clockTime.describe('When it ends, e.g. "16:00".'),
        reason: z.string().max(120).optional().describe('Why — shown on the desk timeline.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ court, date, from, to, reason }) => {
      const start = minutesOf(from);
      const end = minutesOf(to);
      if (!validBlockWindow(start, end)) {
        return fail(`${from}–${to} is not a closure the club can draw.`, 'It must run forwards and sit inside opening hours.');
      }

      const now = nowLocal();
      const standing = (await deskBookings(date, now.epochMs)).filter(
        (b) =>
          (court == null || b.court_id === court) && b.start_min < end && b.end_min > start,
      );

      const block = await createBlock({ court, date, start, end, reason: reason ?? null });

      return ok({
        id: block.id,
        court: block.court_id,
        courtName: block.court_id == null ? 'Both courts' : courtName(block.court_id),
        date: block.date,
        from: timeOf(block.start_min),
        to: timeOf(block.end_min),
        reason: block.reason,
        // The thing somebody has to act on, said out loud rather than left
        // to be discovered on the timeline.
        bookingsStillStanding: standing.map((b) => ({
          id: b.id,
          reference: b.id.slice(0, 8),
          name: b.name,
          phone: b.phone || null,
          from: timeOf(b.start_min),
          to: timeOf(b.end_min),
        })),
      });
    },
  );

  server.registerTool(
    'reopen_court',
    {
      title: 'Lift a closure',
      description: 'Remove a closure by its id, putting those start times back on the booking page. The ids come from list_bookings.',
      inputSchema: {
        closureId: z.number().int().positive().describe('The closure id.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ closureId }) => {
      const lifted = await deleteBlock(closureId);
      return lifted
        ? ok({ closureId, reopened: true })
        : fail(`There is no closure ${closureId} — it may already have been lifted.`);
    },
  );

  server.registerTool(
    'court_usage',
    {
      title: 'How busy the courts were',
      description:
        'Court usage over a window: hours sold per day, how many bookings and how many ' +
        'distinct people, coached share, money in and still owed, and usage against the ' +
        'hours actually playable — which is not the same on both courts, since Court B has ' +
        'no floodlights. Counts slots sold, not heads on court; use attendance_report for people.',
      inputSchema: dateWindow,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ from, to }) => {
      const bad = badWindow(from, to);
      if (bad) return bad;

      const [perDay, totals, owed] = await Promise.all([
        hoursByDate(from, to),
        bookingTotals(from, to),
        owedOnCourts(nowLocal().date),
      ]);

      // Playable hours, court by court: B is dark from dusk whatever the
      // club's closing time says.
      const days = daysBetween(from, to);
      const capacityHours =
        (days * COURTS.reduce((n, c) => n + (lastPlay(c.id) - OPEN_MIN), 0)) / 60;

      return ok({
        from,
        to,
        days,
        bookings: totals.bookings,
        people: totals.people,
        bookingsWithNoNumber: totals.anonymous,
        coachedBookings: totals.coached,
        courtHoursSold: totals.courtHours,
        capacityHours,
        usage: capacityHours === 0 ? null : `${Math.round((totals.courtHours / capacityHours) * 100)}%`,
        money: {
          paid: totals.paid,
          unpaidInWindow: totals.unpaid,
          owedOnPastCourtsClubWide: owed,
        },
        byDate: Object.entries(perDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, hours]) => ({ date, courtHours: hours })),
      });
    },
  );
}

/**
 * A booking from whatever the caller typed — a full id or the eight-character
 * reference off a screen. Ambiguity is refused, not guessed at: the one
 * mistake worth ruling out here is cancelling the wrong person's court.
 */
async function resolve(
  ref: string,
): Promise<{ booking: DeskBooking } | { error: ReturnType<typeof fail> }> {
  const found = await bookingByReference(ref.trim());

  if (found === null) return { error: fail(`No booking matches "${ref}".`) };

  if ('ambiguous' in found) {
    return {
      error: fail(
        `"${ref}" matches ${found.ambiguous.length} bookings.`,
        `Use a full id: ${found.ambiguous.map((b) => `${b.id} (${b.name}, ${b.date})`).join('; ')}.`,
      ),
    };
  }

  return found;
}

/** One booking, as a model should read it: times as clocks, coach as a boolean. */
function describeBooking(b: DeskBooking) {
  return {
    id: b.id,
    reference: b.id.slice(0, 8),
    court: b.court_id,
    courtName: courtName(b.court_id),
    date: b.date,
    from: timeOf(b.start_min),
    to: timeOf(b.end_min),
    name: b.name,
    phone: b.phone || null,
    email: b.email,
    withCoach: Boolean(b.coach),
    status: b.status,
    paid: b.paid,
    amount: b.amount,
    notes: b.notes,
    holdExpiresAt: b.expires_at ? new Date(b.expires_at).toISOString() : null,
    createdAt: new Date(b.created_at).toISOString(),
  };
}

/** Inclusive day count. Both ends are days somebody could have played. */
function daysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) n += 1;
  return n;
}
