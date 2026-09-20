/**
 * Leads — the vocabulary.
 *
 * Pure, and deliberately free of the database, for the same reason
 * src/lib/roster.ts is: src/lib/db/schema.ts imports the lists below to build
 * its CHECK constraints, so anything here that reached for `db` would close a
 * circle. Storage lives in src/lib/leads.ts, the view model in
 * src/lib/admin/leads.ts.
 *
 * ── The one rule that shapes this whole feature ──────────────────────────
 *
 * WhatsApp does not let a business send whatever it likes whenever it likes.
 * There are exactly two modes, and which one is legal right now depends on a
 * clock:
 *
 *   freeform  — any wording at all, but ONLY within 24 hours of the lead's
 *               own last message. Free.
 *   template  — always allowed, but the wording must have been registered
 *               with Meta and approved beforehand. Billable.
 *
 * A lead is by definition someone who has not written to us yet, so the first
 * message out is always a template. Their reply then opens 24 hours of free
 * conversation, and every further reply pushes the deadline out again.
 *
 * `replyWindow` below is that clock, and it is the only thing the composer
 * consults to decide whether the desk may type freely or must pick a
 * template. Getting it wrong does not produce a warning — Meta rejects the
 * send outright — so it is computed in one place and reused everywhere.
 */

export const LEAD_STAGES = [
  'new',
  'contacted',
  'trial_booked',
  'came_to_trial',
  'joined',
  'lost',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** The board's column headings, in order. Keys are the stored values. */
export const STAGE_LABELS: Record<LeadStage, string> = {
  new: 'NEW',
  contacted: 'CONTACTED',
  trial_booked: 'TRIAL BOOKED',
  came_to_trial: 'CAME TO TRIAL',
  joined: 'JOINED',
  lost: 'LOST',
};

/** The board draws these five. `lost` is real but is not a column. */
export const BOARD_STAGES: readonly LeadStage[] = [
  'new',
  'contacted',
  'trial_booked',
  'came_to_trial',
  'joined',
];

export const LEAD_SOURCES = [
  'instagram',
  'facebook',
  'whatsapp',
  'walk_in',
  'referral',
  'other',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const SOURCE_LABELS: Record<LeadSource, string> = {
  instagram: 'IG',
  facebook: 'FB',
  whatsapp: 'WhatsApp',
  walk_in: 'Walk-in',
  referral: 'Referral',
  other: 'Other',
};

export const MESSAGE_DIRECTIONS = ['in', 'out'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

/**
 * A message's life. `queued` is ours — the row exists before Meta has been
 * asked — and the rest are what Meta's webhook calls back with. `failed` is
 * terminal and carries `error`.
 */
export const MESSAGE_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export function isStage(v: unknown): v is LeadStage {
  return typeof v === 'string' && (LEAD_STAGES as readonly string[]).includes(v);
}

export function isSource(v: unknown): v is LeadSource {
  return typeof v === 'string' && (LEAD_SOURCES as readonly string[]).includes(v);
}

/* --------------------------------------------------------- the 24h window */

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export type ReplyWindow =
  /** Inside 24 hours of their last message: type anything, free. */
  | { open: true; closesAt: Date; msLeft: number }
  /** Outside it, or they have never written. A template is the only way in. */
  | { open: false; closesAt: Date | null; everWrote: boolean };

/**
 * May we send freeform text to this lead right now?
 *
 * `lastInboundAt` is the timestamp of their most recent message to us, or
 * null if they have never sent one. Everything the composer does hangs off
 * the answer.
 */
export function replyWindow(lastInboundAt: Date | null, now: Date = new Date()): ReplyWindow {
  if (!lastInboundAt) return { open: false, closesAt: null, everWrote: false };

  const closesAt = new Date(lastInboundAt.getTime() + WINDOW_MS);
  const msLeft = closesAt.getTime() - now.getTime();

  return msLeft > 0
    ? { open: true, closesAt, msLeft }
    : { open: false, closesAt, everWrote: true };
}

/** "23h left", "45 min left" — the countdown on a lead card. */
export function fmtWindowLeft(msLeft: number): string {
  const mins = Math.max(0, Math.floor(msLeft / 60000));
  if (mins < 60) return `${mins} min left`;
  return `${Math.floor(mins / 60)}h left`;
}

/**
 * "14 min", "3 hr", "2 days" — how long since something happened. The age on
 * every lead card, and the club's real measure of whether it is keeping up.
 */
export function fmtAge(then: Date, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days`;
}

/**
 * "EK" — who owns the conversation, drawn in the corner of the card.
 *
 * Only letters count. A lead's name is whatever their WhatsApp profile says
 * or whatever the desk typed, so it genuinely arrives as "Tony (test)",
 * "J. Massawe" or "+255754112233" — and taking the first character of every
 * word would draw "T(" for the first and nothing readable for the last.
 * Falls back to the first two letters found anywhere, then to a dash.
 */
export function initialsOfName(name: string): string {
  const words = name.split(/[^\p{L}]+/u).filter(Boolean);

  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return '—';
}

/* ------------------------------------------------------- the way through */

/**
 * How far along a stage is.
 *
 * The board is a progression, so the funnel needs to say "reached trial
 * booked" and count everyone at that stage OR past it — a lead who joined
 * obviously booked a trial first, and counting only the current stage would
 * draw a funnel that got wider at the bottom.
 *
 * `lost` is deliberately outside the order. Somebody who went quiet is not
 * "further along" than somebody being talked to, and the table keeps no
 * stage history, so the honest answer for a lost lead is that we no longer
 * know how far they got. They are counted once, in their own figure.
 */
const STAGE_RANK: Record<LeadStage, number> = {
  new: 0,
  contacted: 1,
  trial_booked: 2,
  came_to_trial: 3,
  joined: 4,
  lost: -1,
};

/** Did a lead at `stage` get at least as far as `target`? */
export function reached(stage: LeadStage, target: LeadStage): boolean {
  return stage !== 'lost' && STAGE_RANK[stage] >= STAGE_RANK[target];
}

/**
 * The windows the funnel may be read over, in days. 0 is everything.
 *
 * Kept here rather than in the screen because the Route Handler validates
 * against the same list.
 */
export const PERIODS = [7, 30, 90, 0] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  7: 'Last 7 days',
  30: 'Last 30 days',
  90: 'Last 90 days',
  0: 'All time',
};

export function isPeriod(v: unknown): v is Period {
  return (PERIODS as readonly number[]).includes(Number(v));
}

/** The start of a window, or null for all time. */
export function periodStart(days: Period, now: Date = new Date()): Date | null {
  return days === 0 ? null : new Date(now.getTime() - days * 86_400_000);
}

/** "3 hr", "45 min" — a duration, for the median-reply reading. */
export function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)} hr`;
  const days = hrs / 24;
  return `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`;
}

/** "64%", and "—" when there is nothing to take a percentage of. */
export function pct(part: number, whole: number): string {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`;
}

/* ------------------------------------------------------------- lane paging */

/**
 * How many cards a lane draws before it offers to show the rest.
 *
 * A pipeline with several hundred leads in it is normal — and drawing all of
 * them is not. Every card is a draggable node, a subscription and a few
 * hundred bytes on the wire, so a lane that drew all 255 of its leads would
 * cost the desk a megabyte and forty screens of scrolling to look at the six
 * people who are actually waiting. Every CRM that survives contact with real
 * data pages its lanes; this is that number.
 */
export const LANE_PAGE = 25;

/** How many cards each lane has been asked to draw, where not the default. */
export type LaneLimits = Partial<Record<LeadStage, number>>;

/**
 * The wire format for the above: "contacted:50,new:75".
 *
 * It goes in the query string, so it is also what the screen's URL says and
 * what the cache is keyed on. Anything unrecognised is dropped rather than
 * argued with — a hand-edited URL should show a board, not an error.
 */
export function parseLimits(raw: string | null | undefined): LaneLimits {
  const limits: LaneLimits = {};
  if (!raw) return limits;

  for (const part of raw.split(',')) {
    const [stage, n] = part.split(':');
    const count = Number(n);
    if (!isStage(stage) || !Number.isInteger(count)) continue;
    // Clamped: a lane always draws at least a page, and never more than the
    // whole pipeline could plausibly hold in one screen.
    limits[stage] = Math.min(Math.max(count, LANE_PAGE), 2000);
  }
  return limits;
}

export function formatLimits(limits: LaneLimits): string {
  return Object.entries(limits)
    .filter(([, n]) => n && n > LANE_PAGE)
    .map(([stage, n]) => `${stage}:${n}`)
    .sort()
    .join(',');
}
