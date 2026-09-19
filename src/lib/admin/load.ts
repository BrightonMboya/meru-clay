import 'server-only';

import { cache } from 'react';
import { deskBlocks } from '../blocks';
import {
  getLead,
  latestMessages,
  leadFacts,
  listLeads,
  listMessages,
  messageTotals,
  sentToday,
} from '../leads';
import { deskBookings, hoursByDate } from '../bookings';
import { enrolmentCounts } from '../enrolments';
import { lastAttendedByPlayer } from '../attendance';
import { bookedBetween, lastPlayedByPhone, listCoaches, listPlayers } from '../players';
import { initialsOf } from '../roster';
import { addDays, isValidDate, nowLocal } from '../time';
import { periodStart, replyWindow, type LeadStage, type Period } from '../pipeline';
import { numberHealth, templates, type WaTemplate } from '../whatsapp';
import { deskDay, weekDates, type Desk } from './desk';
import {
  buildBoard,
  buildChat,
  buildDetail,
  buildFunnel,
  buildMeter,
  windowNotice,
  type ChatDay,
  type Column,
  type Detail,
  type Funnel,
} from './leads';
import { buildRoster, type Roster } from './players';

/**
 * The court desk for one day, from the database.
 *
 * The only place the desk touches Postgres. `deskDay` stays pure and does the
 * arranging; this fetches what it cannot derive — the day's rows, the week's
 * totals and the class registers — in one round trip each.
 *
 * `date` defaults to today at the club, not on the server's clock or the
 * operator's device: see the note at the top of src/lib/time.ts.
 *
 * Wrapped in React's `cache`, so the admin layout and the page it wraps —
 * which both need the day — share one set of queries per request.
 */
export const loadDesk = cache(async (date?: string): Promise<Desk> => {
  const clock = nowLocal();
  const day = date && isValidDate(date) ? date : clock.date;
  const week = weekDates(day);

  const [bookings, blocks, hoursByDay, enrolments] = await Promise.all([
    deskBookings(day, clock.epochMs),
    deskBlocks(day),
    hoursByDate(week[0], week[6]),
    enrolmentCounts(day),
  ]);

  const isToday = day === clock.date;

  return deskDay({
    date: day,
    // The now-line only means anything on today; on any other day it sits at
    // opening time rather than pretending the club is mid-afternoon.
    now: isToday ? clock.minutes : 0,
    isToday,
    epochMs: clock.epochMs,
    bookings,
    blocks,
    hoursByDay,
    enrolments,
  });
});

/**
 * The club roster, from the database.
 *
 * Three queries and a pure arrangement, the same division `loadDesk` makes:
 * `listPlayers` fetches the rows, the other two fetch the facts about them
 * that live in the bookings table — when they last played, and whether they
 * already have a court this week — and `buildRoster` counts everything the
 * screen shows. Nothing on the roster is a stored total.
 *
 * Request-memoised like the desk, so a page and the route handler behind its
 * refresh do not ask twice.
 */
export const loadRoster = cache(async (): Promise<Roster> => {
  const today = nowLocal().date;
  const [rows, lastPlayed, attended, bookedThisWeek] = await Promise.all([
    listPlayers(),
    lastPlayedByPhone(today),
    lastAttendedByPlayer(today),
    // Today plus six is seven days inclusive — the week the rail speaks for.
    bookedBetween(today, addDays(today, 6)),
  ]);
  return buildRoster({ today, rows, lastPlayed, attended, bookedThisWeek });
});

/**
 * Who is at the desk, for the shell's operator row.
 *
 * The first coach on the roster, alphabetically. The shell used to name a
 * hard-coded "Elias Kimaro"; until there is a sign-in, the club's own coach
 * list is a truer answer than an invented one. Falls back to the club itself
 * rather than an empty row on a database with no coaches in it yet.
 */
export const loadOperator = cache(async () => {
  const [coach] = await listCoaches();
  if (!coach) return { initials: 'MC', name: 'Meru Clay', role: 'Club office' };
  return { initials: initialsOf(coach.name), name: coach.name, role: 'Coach' };
});

/**
 * The lead board.
 *
 * Two queries, not one per card: `latestMessages` fetches the last line of
 * every conversation in a single pass — see the note on it — because a board
 * that queried per lead would be fine on six leads and unusable on sixty.
 *
 * Returns the built columns rather than the rows, for the same reason
 * `loadRoster` does: the Route Handler behind the screen's refresh hands back
 * exactly this, so the first paint and every later one are built by the same
 * code and cannot drift apart. It is also what keeps `Date` off the wire —
 * everything here is already a string by the time it is serialised.
 */
export type Board = {
  columns: Column[];
  total: number;
  lost: number;
  /** The send meter above the lanes, over the same window the funnel uses. */
  meter: ReturnType<typeof buildMeter>;
};

export const loadLeadBoard = cache(
  async (campaign: string | null = null, days: Period = 30): Promise<Board> => {
    const [rows, latest, totals] = await Promise.all([
      listLeads(),
      latestMessages(),
      messageTotals(periodStart(days)),
    ]);

    // Filtering here rather than in SQL keeps `listLeads` the one query every
    // screen shares, and the board is a few dozen rows — the cost is nothing
    // and the alternative is a second query that can disagree with the first.
    const scoped = campaign
      ? rows.filter((r) => (r.campaign?.trim() || '') === campaign)
      : rows;

    const withLatest = scoped.map((lead) => ({ ...lead, latest: latest.get(lead.id) ?? null }));

    return {
      columns: buildBoard(withLatest),
      // Counted from the rows, not from the columns — `lost` leads are real and
      // have no column, and the number at the top should not pretend otherwise.
      total: scoped.length,
      lost: scoped.filter((r) => r.stage === 'lost').length,
      meter: buildMeter(totals),
    };
  },
);

/* ------------------------------------------------------ what the figures say */

/** Everything on the leads screen that is a count rather than a card. */
export type Pipeline = { funnel: Funnel };

/**
 * The lead rows, reduced to dates, memoised for the request.
 *
 * Both the funnel and the number panel want them, and they arrive through
 * different components of the same page.
 */
const facts = cache(leadFacts);

/**
 * The funnel.
 *
 * The window is applied here rather than in SQL for the same reason the
 * board's filter is: one query, filtered in memory, cannot disagree with
 * itself.
 *
 * The meter is the exception and is counted in the database, because it
 * counts messages rather than leads and there can be thousands of them.
 */
export const loadPipeline = cache(
  async (days: Period, campaign: string | null = null): Promise<Pipeline> => {
    const now = new Date();
    const since = periodStart(days, now);

    const rows = await facts();

    const scoped = rows.filter(
      (r) =>
        (!since || r.createdAt >= since) &&
        (!campaign || (r.campaign?.trim() || '') === campaign),
    );

    return { funnel: buildFunnel(scoped, days, now) };
  },
);

/**
 * The sending number, as Meta describes it.
 *
 * Every figure comes from the account: the quality rating and the daily limit
 * from the phone number itself, the template counts from the Business
 * Account. The one figure that is ours is how many people the club has
 * messaged today, which is what makes the limit mean anything.
 *
 * Returns the reason instead when WhatsApp is not connected. A panel that
 * said "Quality rating: High" without having asked would be the most
 * misleading thing on the screen.
 */
export type NumberPanel =
  | {
      name: string;
      number: string;
      verified: boolean;
      facts: Array<{ label: string; value: string; accent?: boolean }>;
    }
  | { error: string };

export const loadNumberPanel = cache(async (): Promise<NumberPanel> => {
  const [health, tpl, today, rows] = await Promise.all([
    numberHealth(),
    templates(),
    sentToday(),
    facts(),
  ]);

  if ('error' in health) return { error: health.error };

  const approved = tpl.list.filter((t) => t.status === 'approved').length;
  const pending = tpl.list.filter((t) => t.status === 'pending').length;
  const open = rows.filter((r) => replyWindow(r.lastInboundAt).open).length;

  const nearLimit = health.dailyLimit !== null && today >= health.dailyLimit * 0.8;

  return {
    name: health.name,
    number: health.number,
    verified: health.verified,
    facts: [
      { label: 'Quality rating', value: health.quality, accent: health.quality === 'Low' },
      {
        label: 'Messaged today',
        value: `${today} of ${health.limitLabel}`,
        accent: nearLimit,
      },
      {
        label: 'Templates',
        value: tpl.error
          ? 'Not readable — set WHATSAPP_WABA_ID'
          : `${approved} approved${pending ? ` · ${pending} in review` : ''}`,
        accent: Boolean(tpl.error) || approved === 0,
      },
      { label: 'Free windows open', value: `${open} conversation${open === 1 ? '' : 's'}` },
    ],
  };
});

/** One lead, opened: the header, the conversation, and what the composer may do. */
export type LeadThread = {
  id: number;
  name: string;
  phone: string;
  stage: LeadStage;
  detail: Detail;
  /** The conversation, grouped into days. */
  chat: ChatDay[];
  /** Null when the desk may type freely; the explanation when it may not. */
  notice: { headline: string; detail: string; locked: string } | null;
  canType: boolean;
  /**
   * Every template Meta has approved for this account, fetched from the
   * Business Account rather than typed into the code — an unapproved
   * template cannot be sent, so a list the club invented would be a list of
   * buttons that all fail.
   *
   * Empty is a real and common state, and while it is empty a lead outside
   * their window genuinely cannot be reached. The composer says so rather
   * than offering something that cannot work.
   */
  templates: WaTemplate[];
  /** Why there are no templates, when that is a fault rather than a fact. */
  templatesError: string | null;
};

export const loadLeadThread = cache(async (id: number): Promise<LeadThread | null> => {
  const lead = await getLead(id);
  if (!lead) return null;

  const [messages, tpl] = await Promise.all([listMessages(id), templates()]);

  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    stage: lead.stage,
    detail: buildDetail(lead, messages),
    chat: buildChat(messages),
    notice: windowNotice(lead),
    canType: replyWindow(lead.lastInboundAt).open,
    // Only the approved ones reach the composer; the rest are Meta's problem
    // and are reported on the leads screen, not here.
    templates: tpl.list.filter((t) => t.status === 'approved'),
    templatesError: tpl.error,
  };
});
