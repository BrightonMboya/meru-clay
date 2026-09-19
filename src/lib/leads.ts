import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from './db/client';
import { leadMessages, leads } from './db/schema';
import type {
  LeadSource,
  LeadStage,
  MessageDirection,
  MessageStatus,
} from './pipeline';

/**
 * Leads — storage.
 *
 * Plain functions over Drizzle handing back plain objects, the same shape as
 * src/lib/players.ts, so nothing above this file sees a column name.
 *
 * Two of these do more than they look like they do, and both are on the
 * inbound path:
 *
 * `recordInbound` is the one that matters. It is called by the webhook for
 * every message anyone sends the club's WhatsApp number, and it has to cope
 * with three things at once — the sender may not be a lead yet, Meta retries
 * deliveries so the same message will arrive more than once, and the row it
 * writes is what reopens the 24-hour reply window. All three are handled
 * where they belong, in the database, rather than by reading first and hoping
 * nothing else writes in between.
 *
 * `recordOutbound` writes the row BEFORE the send is attempted. A message
 * that Meta refuses still happened as far as the club is concerned — someone
 * pressed send — and a failure the desk cannot see is worse than a failed row
 * it can. The send's outcome is then stamped onto the same row.
 */

/** One lead, as the screens think of one. */
export type LeadRow = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  stage: LeadStage;
  source: LeadSource;
  campaign: string | null;
  note: string | null;
  owner: string | null;
  playerId: number | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LeadMessageRow = {
  id: number;
  leadId: number;
  direction: MessageDirection;
  body: string;
  waMessageId: string | null;
  template: string | null;
  status: MessageStatus;
  error: string | null;
  createdAt: Date;
};

const shape = {
  id: leads.id,
  name: leads.name,
  phone: leads.phone,
  email: leads.email,
  stage: leads.stage,
  source: leads.source,
  campaign: leads.campaign,
  note: leads.note,
  owner: leads.owner,
  playerId: leads.playerId,
  lastInboundAt: leads.lastInboundAt,
  lastOutboundAt: leads.lastOutboundAt,
  createdAt: leads.createdAt,
  updatedAt: leads.updatedAt,
};

/* ------------------------------------------------------------------ reads */

/** Every lead, newest first. The board and the list are both built from this. */
export function listLeads(): Promise<LeadRow[]> {
  return db.select(shape).from(leads).orderBy(desc(leads.createdAt));
}

export async function getLead(id: number): Promise<LeadRow | null> {
  const [row] = await db.select(shape).from(leads).where(eq(leads.id, id)).limit(1);
  return row ?? null;
}

/** The conversation, oldest first — which is the order it is read in. */
export function listMessages(leadId: number): Promise<LeadMessageRow[]> {
  return db
    .select()
    .from(leadMessages)
    .where(eq(leadMessages.leadId, leadId))
    .orderBy(asc(leadMessages.createdAt));
}

/**
 * The last message of every conversation, keyed by lead.
 *
 * One query rather than one per card: the board draws up to a few dozen
 * leads and each shows its latest line, and doing that with a query apiece is
 * how a screen that is fine on demo data dies on real data.
 */
export async function latestMessages(): Promise<Map<number, LeadMessageRow>> {
  const rows = await db
    .selectDistinctOn([leadMessages.leadId])
    .from(leadMessages)
    .orderBy(leadMessages.leadId, desc(leadMessages.createdAt));

  return new Map(rows.map((r) => [r.leadId, r]));
}

/* ----------------------------------------------------------------- writes */

export type NewLeadInput = {
  name: string;
  phone: string;
  email?: string | null;
  stage?: LeadStage;
  source?: LeadSource;
  campaign?: string | null;
  note?: string | null;
  owner?: string | null;
};

/**
 * Add a lead. Returns null when that number is already a live lead — the
 * caller turns that into a 409, the same way the roster does. See
 * `uniq_lead_phone`.
 */
export async function createLead(input: NewLeadInput): Promise<LeadRow | null> {
  const [row] = await db
    .insert(leads)
    .values({
      name: input.name.trim(),
      phone: input.phone,
      email: input.email?.trim() || null,
      stage: input.stage ?? 'new',
      source: input.source ?? 'other',
      campaign: input.campaign?.trim() || null,
      note: input.note?.trim() || null,
      owner: input.owner?.trim() || null,
    })
    .onConflictDoNothing()
    .returning(shape);

  return row ?? null;
}

export async function setStage(id: number, stage: LeadStage): Promise<LeadRow | null> {
  const [row] = await db
    .update(leads)
    .set({ stage, updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning(shape);

  return row ?? null;
}

/**
 * Write the row for a message we are about to send.
 *
 * Deliberately before the API call — see the header note. Comes back
 * `queued`; `finishOutbound` stamps the outcome on it.
 */
export async function recordOutbound(
  leadId: number,
  body: string,
  template: string | null,
): Promise<LeadMessageRow> {
  const [row] = await db
    .insert(leadMessages)
    .values({ leadId, direction: 'out', body, template, status: 'queued' })
    .returning();

  return row!;
}

/**
 * Stamp what Meta said onto the queued row.
 *
 * `lastOutboundAt` moves only on success. It is how the desk sees when the
 * club last actually reached somebody, and a message that never left would
 * be a lie there — the sort that makes a follow-up list quietly wrong.
 */
export async function finishOutbound(
  messageId: number,
  leadId: number,
  result: { ok: true; waMessageId: string } | { ok: false; error: string },
): Promise<LeadMessageRow> {
  const [row] = await db
    .update(leadMessages)
    .set(
      result.ok
        ? { status: 'sent', waMessageId: result.waMessageId, error: null }
        : { status: 'failed', error: result.error },
    )
    .where(eq(leadMessages.id, messageId))
    .returning();

  if (result.ok) {
    await db
      .update(leads)
      .set({ lastOutboundAt: new Date(), updatedAt: new Date() })
      .where(eq(leads.id, leadId));
  }

  return row!;
}

/**
 * A message arrived. Returns the lead it belongs to, and whether this was new.
 *
 * Everything awkward about the inbound path is here:
 *
 *   unknown sender — somebody who messages the club's number without ever
 *     having filled in a form is still a lead, and a good one. A row is
 *     created for them, sourced 'whatsapp', named from their WhatsApp profile
 *     until the desk knows better.
 *
 *   duplicates — Meta retries webhook deliveries until it gets a 200, and
 *     will re-send ones it already delivered. `onConflictDoNothing` against
 *     `uniq_lead_message_wamid` makes the second and third copies no-ops
 *     instead of a conversation that repeats itself.
 *
 *   the window — `last_inbound_at` is what the 24-hour rule is measured
 *     from, so it is stamped here and nowhere else. It is moved with a
 *     `greatest` so that a retry arriving late, or two messages processed out
 *     of order, can never drag the deadline backwards and lock the desk out
 *     of a conversation that is genuinely open.
 */
export async function recordInbound(msg: {
  from: string;
  text: string;
  waMessageId: string;
  at: Date;
  profileName: string | null;
}): Promise<{ lead: LeadRow; created: boolean; duplicate: boolean }> {
  // Meta reports numbers without a '+'; the club stores E.164 with one.
  const phone = msg.from.startsWith('+') ? msg.from : `+${msg.from}`;

  const [existing] = await db
    .select(shape)
    .from(leads)
    .where(and(eq(leads.phone, phone), sql`${leads.stage} <> 'lost'`))
    .limit(1);

  let lead = existing ?? null;
  let created = false;

  if (!lead) {
    const [row] = await db
      .insert(leads)
      .values({
        name: msg.profileName?.trim() || phone,
        phone,
        source: 'whatsapp',
        stage: 'new',
        note: msg.text.slice(0, 500),
        lastInboundAt: msg.at,
      })
      .onConflictDoNothing()
      .returning(shape);

    if (row) {
      lead = row;
      created = true;
    } else {
      // Lost a race with another webhook delivery. The row exists now.
      const [raced] = await db
        .select(shape)
        .from(leads)
        .where(and(eq(leads.phone, phone), sql`${leads.stage} <> 'lost'`))
        .limit(1);
      lead = raced!;
    }
  }

  const [inserted] = await db
    .insert(leadMessages)
    .values({
      leadId: lead.id,
      direction: 'in',
      body: msg.text,
      waMessageId: msg.waMessageId,
      status: 'delivered',
    })
    .onConflictDoNothing()
    .returning();

  const duplicate = !inserted;

  // Only a message we had not seen moves the clock, and only ever forwards.
  if (!duplicate && !created) {
    await db
      .update(leads)
      .set({
        lastInboundAt: sql`greatest(${leads.lastInboundAt}, ${msg.at.toISOString()}::timestamptz)`,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, lead.id));
  }

  return { lead, created, duplicate };
}

/**
 * Meta's delivery receipt. Never walks a message backwards — 'read' can
 * arrive before 'delivered', and a status that regressed would show the desk
 * a message going out of focus after it had been seen.
 */
const RANK: Record<MessageStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

export async function applyStatus(
  waMessageId: string,
  status: MessageStatus,
  error: string | null,
): Promise<void> {
  await db
    .update(leadMessages)
    .set({ status, ...(error ? { error } : {}) })
    .where(
      and(
        eq(leadMessages.waMessageId, waMessageId),
        sql`${leadMessages.status} <> 'failed'`,
        sql`case ${leadMessages.status}
              when 'queued' then 0 when 'sent' then 1
              when 'delivered' then 2 when 'read' then 3 else 4
            end < ${RANK[status]}`,
      ),
    );
}

/* ------------------------------------------------- counting the pipeline */

/**
 * One lead, reduced to the dates the funnel is counted from.
 *
 * The funnel, the campaign table and the reply-time median are all counted
 * from this one query rather than from three. Two of the columns cannot come
 * from the `leads` table at all — when we first answered somebody, and when
 * they first answered us — so they are aggregated out of the messages in the
 * same pass instead of with a query per lead.
 *
 * `first_outbound_at` skips failed sends on purpose: a message Meta refused
 * is not a reply, and counting it would let the club congratulate itself on
 * answering people it never reached.
 */
export type LeadFact = {
  id: number;
  stage: LeadStage;
  source: LeadSource;
  campaign: string | null;
  createdAt: Date;
  firstOutboundAt: Date | null;
  firstInboundAt: Date | null;
  lastInboundAt: Date | null;
};

/** Postgres' own timestamp string, or a Date, or nothing. */
function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(String(value));
}

export function leadFacts(): Promise<LeadFact[]> {
  return db
    .select({
      id: leads.id,
      stage: leads.stage,
      source: leads.source,
      campaign: leads.campaign,
      createdAt: leads.createdAt,
      // `mapWith` is not decoration. A timestamp inside a raw aggregate has
      // no Drizzle column behind it, so the driver hands back the Postgres
      // string rather than a Date — and every date arithmetic downstream
      // would fail on it.
      firstOutboundAt: sql<Date | null>`min(${leadMessages.createdAt}) filter (
        where ${leadMessages.direction} = 'out' and ${leadMessages.status} <> 'failed')`.mapWith(
        toDate,
      ),
      firstInboundAt: sql<Date | null>`min(${leadMessages.createdAt}) filter (
        where ${leadMessages.direction} = 'in')`.mapWith(toDate),
      lastInboundAt: leads.lastInboundAt,
    })
    .from(leads)
    .leftJoin(leadMessages, eq(leadMessages.leadId, leads.id))
    .groupBy(leads.id);
}

/**
 * What the number actually sent and received, over a window.
 *
 * Split the way Meta bills: a freeform reply inside the 24-hour window costs
 * nothing, a template does. Failures are counted alongside because a send
 * that did not arrive is the one figure on that meter somebody has to act on.
 */
export type MessageTotals = {
  freeReplies: number;
  templates: number;
  failed: number;
  received: number;
};

export async function messageTotals(since: Date | null): Promise<MessageTotals> {
  const [row] = await db
    .select({
      freeReplies: sql<number>`count(*) filter (
        where ${leadMessages.direction} = 'out'
          and ${leadMessages.template} is null
          and ${leadMessages.status} <> 'failed')::int`,
      templates: sql<number>`count(*) filter (
        where ${leadMessages.direction} = 'out'
          and ${leadMessages.template} is not null
          and ${leadMessages.status} <> 'failed')::int`,
      failed: sql<number>`count(*) filter (where ${leadMessages.status} = 'failed')::int`,
      received: sql<number>`count(*) filter (where ${leadMessages.direction} = 'in')::int`,
    })
    .from(leadMessages)
    .where(since ? sql`${leadMessages.createdAt} >= ${since.toISOString()}::timestamptz` : sql`true`);

  return row ?? { freeReplies: 0, templates: 0, failed: 0, received: 0 };
}

/**
 * How many messages have left the number since midnight.
 *
 * Meta's daily send limit is a rolling 24-hour count of unique recipients, so
 * this is an approximation of it — close enough to warn somebody they are
 * near the ceiling, and honest about being ours rather than Meta's.
 */
export async function sentToday(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${leadMessages.leadId})::int` })
    .from(leadMessages)
    .where(
      and(
        eq(leadMessages.direction, 'out'),
        sql`${leadMessages.status} <> 'failed'`,
        sql`${leadMessages.createdAt} >= date_trunc('day', now())`,
      ),
    );

  return row?.n ?? 0;
}
