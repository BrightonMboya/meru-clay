/**
 * Leads, as the screen reads them.
 *
 * Pure, like src/lib/admin/players.ts. It takes the rows src/lib/leads.ts
 * fetched and arranges them into the board the Paper design draws, without
 * touching the database — which is what lets the Client Component re-filter
 * the same payload without going back to the server.
 *
 * The rule this file follows, the same one the roster follows: a number on
 * this screen is counted, never stored. A column's count is the length of its
 * own list, so the heading and the cards underneath it cannot disagree. The
 * funnel and the message meter below now follow it too — every figure on the
 * leads screen is counted from rows at the moment it is drawn.
 *
 * ── What the screen deliberately does not claim ──────────────────────────
 *
 * There is no ad spend and no cost-per-member anywhere on it. Both need
 * Meta's Ads API, which is a different product from the Cloud API the club
 * sends WhatsApp through and is not connected, so rather than print a
 * plausible TSh figure the screen prints none.
 *
 * The one piece of real domain logic here is WhatsApp's 24-hour rule: the
 * club may only send freeform text within 24 hours of the lead's own last
 * message. Outside that window it must send a template Meta has approved.
 * That is why every card carries a "reply free · Nh left" or an "overdue ·
 * template needed" line, and why the composer locks itself. The clock itself
 * lives in src/lib/pipeline.ts; this file only draws it.
 */
import type { Reading } from '@/components/admin/ui';
import type { LeadFact, LeadMessageRow, LeadRow, MessageTotals } from '@/lib/leads';
import {
  BOARD_STAGES,
  LANE_PAGE,
  PERIOD_LABELS,
  WINDOW_MS,
  SOURCE_LABELS,
  STAGE_LABELS,
  fmtAge,
  fmtDuration,
  fmtWindowLeft,
  initialsOfName,
  pct,
  reached,
  replyWindow,
  type LaneLimits,
  type LeadSource,
  type LeadStage,
  type MessageStatus,
  type Period,
} from '@/lib/pipeline';

/**
 * A card's footer line. `free` is inside the 24-hour window, `overdue` is
 * outside it and needs a template, `money` is a member won, `plain` is a
 * reminder to the coach.
 */
export type FootTone = 'free' | 'overdue' | 'money' | 'plain';

/** A card, plus the id the screen needs to open it. */
export type Lead = {
  id: number;
  name: string;
  /** How long since the last touch. */
  age: string;
  /** Their own words where we have them, otherwise what we did. */
  note: string;
  /** Which ad they came from — "IG · JUNIORS 8–12". */
  source: string;
  foot: string;
  tone: FootTone;
  /** Who owns the conversation. */
  owner: string;
};

export type Column = {
  stage: string;
  stageKey: LeadStage;
  /**
   * Everyone at this stage — not everyone drawn.
   *
   * The two used to be the same number and no longer are: past `LANE_PAGE`
   * the lane draws a page and says how many more there are. The heading has
   * to keep telling the truth about the pipeline, so it counts the rows, and
   * `leads.length` is only what is on screen.
   */
  count: number;
  leads: Lead[];
};

/** A lead and the last thing said, which is all a card needs. */
export type LeadWithLatest = LeadRow & { latest: LeadMessageRow | null };

/**
 * The order cards are drawn in within a lane.
 *
 * Not newest-first, which is the order the rows arrive in and the wrong one
 * for a lane of two hundred: it buries the person who has been waiting three
 * weeks underneath everyone who enquired this morning, and the top of a lane
 * is the only part anybody reads.
 *
 * So the lane is ordered by what the desk can still do something about:
 *
 *   0. their 24-hour window is open — soonest to close first, because after
 *      that it costs a template and Meta's approval to say anything at all;
 *   1. nobody has written to them yet — longest wait first;
 *   2. everyone else — newest first, as before.
 *
 * Returns a sort key rather than a comparator so the two halves can be
 * compared in one pass.
 */
function urgency(row: LeadRow, now: Date): [number, number] {
  const inbound = row.lastInboundAt?.getTime();
  if (inbound !== undefined && now.getTime() - inbound < WINDOW_MS) return [0, inbound];
  if (!row.lastOutboundAt) return [1, row.createdAt.getTime()];
  return [2, -row.createdAt.getTime()];
}

/**
 * The board.
 *
 * One pass over the rows, bucketed by stage, so a lead appears in exactly one
 * column and every count is the length of that bucket — counted before the
 * lane is cut down to the page being shown, so the heading and the cards
 * cannot disagree about how many people there are.
 */
export function buildBoard(
  rows: LeadWithLatest[],
  now = new Date(),
  limits: LaneLimits = {},
): Column[] {
  const byStage = new Map<LeadStage, LeadWithLatest[]>(BOARD_STAGES.map((s) => [s, []]));

  for (const row of rows) {
    // `lost` is a real stage with no column; those leads are simply not drawn.
    byStage.get(row.stage)?.push(row);
  }

  return BOARD_STAGES.map((stage) => {
    const all = byStage.get(stage)!;

    const ordered = all
      .map((row) => ({ row, key: urgency(row, now) }))
      .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1]);

    const limit = limits[stage] ?? LANE_PAGE;

    return {
      stage: STAGE_LABELS[stage],
      stageKey: stage,
      count: all.length,
      leads: ordered.slice(0, limit).map(({ row }) => toCard(row, now)),
    };
  });
}

/**
 * One card.
 *
 * The footer is the part that earns its place. It is the 24-hour window
 * rendered as a sentence, because that window decides what the desk is
 * allowed to do next, and a card that did not say so would send somebody to
 * type a message that cannot be sent.
 */
function toCard(row: LeadWithLatest, now: Date): Lead {
  const window = replyWindow(row.lastInboundAt, now);
  const lastTouch = row.lastInboundAt ?? row.lastOutboundAt ?? row.createdAt;

  const { foot, tone }: { foot: string; tone: FootTone } = row.stage === 'joined'
    ? { foot: 'Joined the club', tone: 'money' }
    : window.open
      ? { foot: `Reply free · ${fmtWindowLeft(window.msLeft)}`, tone: 'free' }
      : window.everWrote
        ? { foot: 'Overdue · template needed', tone: 'overdue' }
        : { foot: 'Not messaged yet · template needed', tone: 'plain' };

  return {
    id: row.id,
    name: row.name,
    age: fmtAge(lastTouch, now),
    // Their last words if they have written, else whatever the form captured.
    note: row.latest?.body ?? row.note ?? 'No message yet.',
    source: sourceLine(row),
    foot,
    tone,
    owner: row.owner ?? initialsOfName(row.name),
  };
}

/** "IG · ADULT BEGINNERS", or just "IG" when no campaign was recorded. */
function sourceLine(row: LeadRow): string {
  const where = SOURCE_LABELS[row.source];
  return row.campaign ? `${where} · ${row.campaign.toUpperCase()}` : where;
}


/* ------------------------------------------------------------ one lead */

/** The header of an opened lead. */
export type Detail = {
  initials: string;
  name: string;
  sub: string;
  facts: Array<{ label: string; value: string; accent?: boolean }>;
};

export function buildDetail(lead: LeadRow, messages: LeadMessageRow[], now = new Date()): Detail {
  const window = replyWindow(lead.lastInboundAt, now);
  const sent = messages.filter((m) => m.direction === 'out' && m.status !== 'failed').length;
  const got = messages.filter((m) => m.direction === 'in').length;

  return {
    initials: initialsOfName(lead.name),
    name: lead.name,
    sub: [lead.phone, lead.email, `came in ${fmtAge(lead.createdAt, now)} ago`]
      .filter(Boolean)
      .join(' · '),
    facts: [
      { label: 'CAME FROM', value: sourceLine(lead) },
      { label: 'STAGE', value: STAGE_LABELS[lead.stage] },
      { label: 'TOUCHES', value: `${sent} sent · ${got} received` },
      {
        label: 'REPLY WINDOW',
        value: window.open
          ? `Open · ${fmtWindowLeft(window.msLeft)}`
          : window.everWrote
            ? 'Closed · template needed'
            : 'Never written · template needed',
        accent: !window.open,
      },
    ],
  };
}

/* ------------------------------------------------------------- the chat */

/**
 * One message, as a bubble.
 *
 * `mine` is the club's side of the conversation, drawn on the right. Note
 * that a failed message is still `mine` and still drawn — see below.
 */
export type ChatMessage = {
  id: number;
  mine: boolean;
  body: string;
  /** "18:42" — the wall-clock time, which is what people scan for. */
  time: string;
  status: MessageStatus;
  /** Meta's complaint, when the send failed. Shown under the bubble. */
  error: string | null;
  /** The approved template used, if any. */
  template: string | null;
};

/** A day's worth of messages, under one separator. */
export type ChatDay = { day: string; messages: ChatMessage[] };

/**
 * The conversation, grouped into days.
 *
 * Grouped rather than a flat list because a thread that runs over weeks is
 * unreadable without the breaks — the club needs to see "she went quiet for
 * four days" as a shape on the screen, not work it out from timestamps.
 *
 * A failed send is kept and drawn in full rather than hidden. It is the one
 * message somebody actually has to act on — the one they believe they sent
 * and did not — so dropping it would be the worst thing this screen could do.
 */
export function buildChat(messages: LeadMessageRow[], now = new Date()): ChatDay[] {
  const days: ChatDay[] = [];

  for (const m of messages) {
    const label = dayLabel(m.createdAt, now);
    // Messages arrive in order, so the run for a day is always the last one.
    let bucket = days[days.length - 1];
    if (!bucket || bucket.day !== label) {
      bucket = { day: label, messages: [] };
      days.push(bucket);
    }

    bucket.messages.push({
      id: m.id,
      mine: m.direction === 'out',
      body: m.body,
      time: m.createdAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      status: m.status,
      error: m.error,
      template: m.template,
    });
  }

  return days;
}

/** "Today", "Yesterday", then the date. How a person names a day. */
function dayLabel(at: Date, now: Date): string {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(at)) / 86_400_000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return at.toLocaleDateString('en-GB', { weekday: 'long' });
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/**
 * What to tell the desk when it cannot type.
 *
 * Null when the window is open and the composer is free. Otherwise the three
 * lines the locked composer shows — and it explains rather than just refuses,
 * because "you cannot type" without a reason reads as a broken screen.
 */
export function windowNotice(
  lead: LeadRow,
  now = new Date(),
): { headline: string; detail: string; locked: string } | null {
  const window = replyWindow(lead.lastInboundAt, now);
  if (window.open) return null;

  const first = lead.name.split(' ')[0];

  if (!window.everWrote) {
    return {
      headline: 'No free reply window yet',
      detail: `${first} has never messaged the club, so WhatsApp will not carry a freeform message. Send an approved template — once ${first} answers, replies are free for 24 hours.`,
      locked: `Typing a free message is locked until ${first} writes back`,
    };
  }

  const closed = window.closesAt!;
  return {
    headline: `Free reply window closed · ${fmtAge(closed, now)} ago`,
    detail: `${first} last messaged ${lead.lastInboundAt!.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })}, so replies were free until ${closed.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })}. Send an approved template to reopen the conversation — their reply starts a fresh 24 hours.`,
    locked: `Typing a free message is locked until ${first} writes back`,
  };
}

/* ---------------------------------------------------------------- funnel */

/** The strip across the top of the screen. */
export type Funnel = {
  /** "THE FUNNEL · 20 AUG – 19 SEP". */
  period: string;
  /** The one line beside it, which is the thing to act on rather than a total. */
  standing: string;
  steps: Reading[];
};

/**
 * The funnel, counted.
 *
 * Every step is the length of a filter over the same array, so the steps
 * cannot contradict each other, and the whole strip is one pass over rows
 * the screen already had to fetch.
 *
 * Two of the steps are honest about something the table cannot tell us. The
 * board keeps only a lead's *current* stage, not the history of how they got
 * there, so "trial booked" counts everyone at that stage or past it — see
 * `reached` — and a lead who booked a trial and then went quiet is counted
 * once, under lost, rather than being guessed at twice.
 */
export function buildFunnel(facts: LeadFact[], days: Period, now = new Date()): Funnel {
  const n = facts.length;
  const answered = facts.filter((f) => f.firstOutboundAt).length;
  const waiting = facts.filter((f) => !f.firstOutboundAt && f.stage !== 'lost').length;
  const wroteBack = facts.filter((f) => f.firstInboundAt).length;
  const openNow = facts.filter((f) => replyWindow(f.lastInboundAt, now).open).length;
  const booked = facts.filter((f) => reached(f.stage, 'trial_booked')).length;
  const came = facts.filter((f) => reached(f.stage, 'came_to_trial')).length;
  const joined = facts.filter((f) => f.stage === 'joined').length;
  const lost = facts.filter((f) => f.stage === 'lost').length;
  const median = medianFirstReply(facts);

  return {
    period: `THE FUNNEL · ${periodLabel(days, now)}`,
    standing:
      n === 0
        ? 'nothing has come in yet'
        : waiting > 0
          ? `${waiting} still waiting on a first reply`
          : 'every enquiry has been answered',
    steps: [
      {
        label: 'ENQUIRIES',
        value: String(n),
        detail: sourceMix(facts),
      },
      {
        label: 'ANSWERED',
        value: String(answered),
        detail: median
          ? `${pct(answered, n)} · median reply in ${fmtDuration(median)}`
          : `${pct(answered, n)} of them`,
        // The step being worked on, which is the one with people stuck in it.
        accent: waiting > 0,
      },
      {
        label: 'WROTE BACK',
        value: String(wroteBack),
        detail:
          openNow > 0
            ? `${pct(wroteBack, n)} · ${openNow} free to reply to now`
            : `${pct(wroteBack, n)} · none inside the free window`,
      },
      {
        label: 'TRIAL BOOKED',
        value: String(booked),
        detail: booked === 0 ? 'none yet' : `${came} turned up · ${booked - came} still to come`,
      },
      {
        label: 'JOINED',
        value: String(joined),
        detail: `${pct(joined, n)} of enquiries · ${lost} lost`,
      },
    ],
  };
}

/** "20 AUG – 19 SEP", or "EVERYTHING" when the window is all of time. */
function periodLabel(days: Period, now: Date): string {
  if (days === 0) return 'EVERYTHING';
  const from = new Date(now.getTime() - days * 86_400_000);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
  return `${fmt(from)} – ${fmt(now)}`;
}

/**
 * "IG 61% · FB 39%" — where the enquiries came from, biggest first.
 *
 * Only the two largest. A third at four per cent is noise on a reading meant
 * to be taken in at a glance, and the campaign table below says the rest.
 */
function sourceMix(facts: LeadFact[]): string {
  if (facts.length === 0) return 'none in this window';

  const counts = new Map<LeadSource, number>();
  for (const f of facts) counts.set(f.source, (counts.get(f.source) ?? 0) + 1);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([source, n]) => `${SOURCE_LABELS[source]} ${pct(n, facts.length)}`)
    .join(' · ');
}

/**
 * How long the club takes to answer, as a median rather than a mean.
 *
 * One enquiry answered three weeks late would drag an average past the point
 * of being any use; the median says what usually happens, which is what
 * somebody deciding whether the desk is keeping up needs.
 */
function medianFirstReply(facts: LeadFact[]): number | null {
  const waits = facts
    .filter((f) => f.firstOutboundAt)
    .map((f) => f.firstOutboundAt!.getTime() - f.createdAt.getTime())
    .filter((ms) => ms >= 0)
    .sort((a, b) => a - b);

  if (waits.length === 0) return null;
  const mid = Math.floor(waits.length / 2);
  return waits.length % 2 ? waits[mid]! : (waits[mid - 1]! + waits[mid]!) / 2;
}

/* ----------------------------------------------------------- the meter */

/**
 * The strip above the board: what the number has sent, and what it cost.
 *
 * Meta bills a marketing template and nothing else, and the club has no
 * access to its own bill through the API — so this counts the messages and
 * lets the invoice speak for itself rather than multiplying by a rate
 * somebody typed in. The third figure is failures, because that is the one
 * on this strip anybody has to do something about.
 */
export function buildMeter(totals: MessageTotals): Array<{
  label: string;
  value: string;
  accent?: boolean;
}> {
  return [
    { label: 'Free replies', value: `${totals.freeReplies} sent` },
    { label: 'Templates', value: `${totals.templates} sent` },
    { label: 'Received', value: `${totals.received}` },
    {
      label: 'Not delivered',
      value: String(totals.failed),
      accent: totals.failed > 0,
    },
  ];
}
