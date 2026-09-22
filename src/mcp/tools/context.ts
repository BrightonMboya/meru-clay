/**
 * The one tool worth calling first.
 *
 * Everything else in this directory is about a specific row. This is the
 * club itself — what day it is at the court, which courts there are, when
 * they open, what things cost, and the exact spellings every other tool
 * will accept for a stage, a level or a membership tier.
 *
 * It exists because the alternative is guessing, and the guesses are all
 * plausible and all wrong. "Today" is Africa/Dar_es_Salaam, not wherever
 * the model thinks it is. A booking starts on a 30-minute grid. Court B has
 * no floodlights and so closes at dusk while Court A plays on. A lead's
 * stage is `trial_booked`, not "Trial Booked". None of that is discoverable
 * from a tool signature, and all of it is cheap to state.
 *
 * Every figure below is read from the module that owns it, so this tool
 * cannot drift from what the booking engine will actually do.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { COURTS, lastPlay } from '@/lib/availability';
import { CURRENCY, LINK_HOURS, PAYMENT_PURPOSES, PAYMENT_STATUSES } from '@/lib/checkout';
import { LEAD_SOURCES, LEAD_STAGES } from '@/lib/pipeline';
import { COACHING, COURT_HIRE, MEMBERSHIP_TIERS, MEMBERSHIPS } from '@/lib/pricing';
import { AVAILABILITIES, LEVELS, PLAYER_ROLES } from '@/lib/roster';
import { WEEK } from '@/lib/schedule';
import {
  BOOKING_WINDOW_DAYS,
  CLOSE_MIN,
  DURATIONS,
  HOLD_MINUTES,
  OPEN_MIN,
  STEP_MIN,
  nowLocal,
} from '@/lib/time';

import { ok, timeOf } from '../reply';

export function registerContextTools(server: McpServer) {
  server.registerTool(
    'club_context',
    {
      title: 'Club context',
      description:
        'The club as it is right now: today\'s date and time at the court, the courts and ' +
        'their opening hours, bookable durations and prices, membership tiers, the weekly ' +
        'class timetable, and the exact vocabulary every other tool accepts (lead stages and ' +
        'sources, player levels and roles, payment purposes and statuses). Call this before ' +
        'anything date-, time- or price-related — the club runs on Africa/Dar_es_Salaam and ' +
        'the two courts do not keep the same hours.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const now = nowLocal();

      return ok({
        now: {
          date: now.date,
          time: timeOf(now.minutes),
          timezone: 'Africa/Dar_es_Salaam (UTC+3, no daylight saving)',
          note: 'This is the club\'s wall clock. Use this date for "today", not your own.',
        },

        courts: COURTS.map((court) => ({
          id: court.id,
          name: court.name,
          floodlit: court.floodlit,
          opens: timeOf(OPEN_MIN),
          // The difference that catches people out: B is dark long before close.
          lastPlayEnds: timeOf(lastPlay(court.id)),
        })),

        booking: {
          opens: timeOf(OPEN_MIN),
          closes: timeOf(CLOSE_MIN),
          durationsMinutes: DURATIONS,
          startsEveryMinutes: STEP_MIN,
          startsOnTheGrid: `Starts must land on a ${STEP_MIN}-minute boundary from ${timeOf(OPEN_MIN)}.`,
          publicBookingWindowDays: BOOKING_WINDOW_DAYS,
          unpaidHoldMinutes: HOLD_MINUTES,
          coach:
            'The club has one coach. A coached booking or a class ties the coach up on both ' +
            'courts at once, not just the one it occupies.',
        },

        prices: {
          currency: CURRENCY,
          courtHire: COURT_HIRE,
          coachingOnTop: COACHING,
          membership: Object.fromEntries(
            MEMBERSHIPS.map((tier) => [
              tier,
              {
                label: MEMBERSHIP_TIERS[tier].label,
                fee: MEMBERSHIP_TIERS[tier].fee,
                months: MEMBERSHIP_TIERS[tier].months,
                // A tier with no term can never fall due, which is why it
                // never appears in memberships_due.
                lapses: MEMBERSHIP_TIERS[tier].months > 0,
              },
            ]),
          ),
          paymentLinkValidHours: LINK_HOURS,
        },

        classes: WEEK.filter((day) => day.rows.length > 0).map((day) => ({
          weekday: day.weekday,
          label: day.label,
          sessions: day.rows.map((row) => ({
            name: row.name,
            court: row.court,
            start: timeOf(row.start),
            end: timeOf(row.end),
            fee: row.fee ?? 0,
            age: row.age ?? null,
          })),
        })),

        vocabulary: {
          leadStages: LEAD_STAGES,
          leadSources: LEAD_SOURCES,
          playerLevels: LEVELS,
          playerRoles: PLAYER_ROLES,
          playerAvailability: AVAILABILITIES,
          membershipTiers: MEMBERSHIPS,
          paymentPurposes: PAYMENT_PURPOSES,
          paymentStatuses: PAYMENT_STATUSES,
        },
      });
    },
  );
}
