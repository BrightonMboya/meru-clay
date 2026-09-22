/**
 * The leads pipeline — enquiries, the board, and WhatsApp.
 *
 * One rule shapes every tool in here and it is not ours: WhatsApp does not
 * let a business send whatever it likes whenever it likes. A freeform
 * message is legal only within 24 hours of the lead's own last message; any
 * other time, the wording must be a template Meta approved beforehand. See
 * the header of src/lib/pipeline.ts.
 *
 * So `send_lead_message` is the one tool here with a sharp edge, and it is
 * deliberately blunt about it: it reports the state of the window on every
 * lead it hands back, refuses a freeform send outside it with an
 * explanation rather than letting Meta refuse it, and writes the row before
 * attempting the send so a failure is visible to the desk instead of
 * vanishing. None of that is this file's doing — `sendToLead` in
 * src/lib/outbox.ts is the club's policy and this is a thin door onto it.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { sendToLead } from '@/lib/outbox';
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  fmtWindowLeft,
  reached,
  replyWindow,
} from '@/lib/pipeline';
import {
  createLead,
  getLead,
  latestMessages,
  leadFacts,
  listLeads,
  listMessages,
  messageTotals,
  sentToday,
  setStage,
  type LeadRow,
} from '@/lib/leads';
import { publish } from '@/lib/realtime';
import { normalisePhone } from '@/lib/roster';

import { fail, ok } from '../reply';

const stage = z.enum(LEAD_STAGES);
const source = z.enum(LEAD_SOURCES);

export function registerLeadTools(server: McpServer) {
  server.registerTool(
    'list_leads',
    {
      title: 'The leads board',
      description:
        'Enquiries on the pipeline, newest first, with the last line of each conversation and ' +
        'whether a free WhatsApp reply is still allowed. Filter by stage, source, campaign, ' +
        'owner, a name-or-number search, or how recently the enquiry came in.',
      inputSchema: {
        stage: stage.optional().describe('Only leads at this stage.'),
        source: source.optional().describe('Only leads from this source.'),
        campaign: z.string().optional().describe('Only leads tagged with this campaign.'),
        owner: z.string().optional().describe('Only leads owned by this person.'),
        search: z.string().optional().describe('Match on name or phone number.'),
        withinDays: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Only enquiries created in the last N days. Omit for all of them.'),
        limit: z.number().int().min(1).max(200).default(50).describe('How many to return.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const [rows, latest] = await Promise.all([listLeads(), latestMessages()]);
      const since = args.withinDays ? Date.now() - args.withinDays * 86_400_000 : null;
      const needle = args.search?.trim().toLowerCase();

      const matched = rows.filter((lead) => {
        if (args.stage && lead.stage !== args.stage) return false;
        if (args.source && lead.source !== args.source) return false;
        if (args.campaign && lead.campaign !== args.campaign) return false;
        if (args.owner && lead.owner !== args.owner) return false;
        if (since && lead.createdAt.getTime() < since) return false;
        if (needle) {
          const hay = `${lead.name} ${lead.phone}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      });

      return ok({
        total: matched.length,
        returned: Math.min(matched.length, args.limit),
        byStage: Object.fromEntries(
          LEAD_STAGES.map((s) => [s, matched.filter((l) => l.stage === s).length]),
        ),
        leads: matched.slice(0, args.limit).map((lead) => {
          const last = latest.get(lead.id);
          return {
            ...describeLead(lead),
            lastMessage: last
              ? {
                  direction: last.direction,
                  body: last.body,
                  status: last.status,
                  at: last.createdAt.toISOString(),
                }
              : null,
          };
        }),
      });
    },
  );

  server.registerTool(
    'get_lead',
    {
      title: 'One lead, with the conversation',
      description:
        'A lead in full plus every WhatsApp message either way, oldest first, and the state ' +
        'of the 24-hour free-reply window.',
      inputSchema: {
        leadId: z.number().int().positive().describe('The lead id.'),
        messageLimit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(50)
          .describe('How many of the most recent messages to include.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ leadId, messageLimit }) => {
      const lead = await getLead(leadId);
      if (!lead) return fail(`No lead with id ${leadId}.`);

      const messages = await listMessages(leadId);
      return ok({
        ...describeLead(lead),
        messageCount: messages.length,
        messages: messages.slice(-messageLimit).map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          template: m.template,
          status: m.status,
          error: m.error,
          at: m.createdAt.toISOString(),
        })),
      });
    },
  );

  server.registerTool(
    'create_lead',
    {
      title: 'Take an enquiry',
      description:
        'Add somebody who has asked about the club. A phone number is required and is not ' +
        'negotiable — it is the WhatsApp address, and messaging them is the point of the ' +
        'board. Refused if that number is already a live lead.',
      inputSchema: {
        name: z.string().min(2).max(80).describe('Their name.'),
        phone: z
          .string()
          .describe('Tanzanian mobile number — 0…, +255… or 255… all accepted.'),
        email: z.string().optional().describe('If they gave one.'),
        stage: stage.default('new').describe('Where they are on the board.'),
        source: source.default('other').describe('How they found the club.'),
        campaign: z.string().optional().describe('Which advert or push brought them in.'),
        owner: z.string().optional().describe('Who at the club is looking after them.'),
        note: z.string().optional().describe('What they asked about.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => {
      const phone = normalisePhone(args.phone);
      if (phone === null) return fail(`"${args.phone}" is not a Tanzanian mobile number.`);
      if (!phone) {
        return fail(
          'A lead needs a phone number — it is the WhatsApp address the board is built on.',
          'Somebody with no number who has actually joined belongs on the roster: use add_player.',
        );
      }

      if (args.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.email)) {
        return fail(`"${args.email}" is not an email address.`);
      }

      const saved = await createLead({
        name: args.name,
        phone,
        email: args.email ?? null,
        stage: args.stage,
        source: args.source,
        campaign: args.campaign ?? null,
        note: args.note ?? null,
        owner: args.owner ?? null,
      });

      if (!saved) return fail(`${phone} is already a live lead.`, 'list_leads with search set to that number will find them.');

      // A new card on the board, for anyone else looking at it.
      await publish(null);

      return ok(describeLead(saved));
    },
  );

  server.registerTool(
    'move_lead',
    {
      title: 'Move a lead along the board',
      description:
        'Change a lead\'s stage. The board keeps only the current stage, not the history of ' +
        'how they got there, so moving somebody backwards loses nothing but also proves ' +
        'nothing. "joined" is the end of the pipeline, not the start of a membership — ' +
        'add_player is what puts them on the roster.',
      inputSchema: {
        leadId: z.number().int().positive().describe('The lead id.'),
        stage: stage.describe('Where to move them.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ leadId, stage: to }) => {
      const moved = await setStage(leadId, to);
      if (!moved) return fail(`No lead with id ${leadId}.`);
      await publish(leadId);
      return ok(describeLead(moved));
    },
  );

  server.registerTool(
    'send_lead_message',
    {
      title: 'Message a lead on WhatsApp',
      description:
        'Send a WhatsApp message to a lead. Read this before calling it: a freeform message ' +
        'is legal only within 24 hours of the lead\'s own last message, and outside that ' +
        'window the only thing that will send is a template Meta has approved. get_lead says ' +
        'which applies. This message goes to a real person\'s phone and cannot be recalled.',
      inputSchema: {
        leadId: z.number().int().positive().describe('The lead id.'),
        body: z
          .string()
          .min(1)
          .max(1000)
          .describe(
            'For a freeform message, the wording to send. For a template, the wording as the ' +
              'lead will read it — Meta stores the template name, not the rendered text, so ' +
              'this is what the club\'s own timeline will show.',
          ),
        template: z
          .string()
          .optional()
          .describe(
            'Name of an approved template. Required outside the 24-hour window; omit it to ' +
              'send freeform.',
          ),
        templateParams: z
          .array(z.string())
          .optional()
          .describe('Values for the template\'s {{1}}, {{2}}… placeholders, in order.'),
        templateLanguage: z
          .string()
          .optional()
          .describe('The template\'s language code, if not the club default. Meta keys a template on name AND language.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ leadId, body, template, templateParams, templateLanguage }) => {
      const lead = await getLead(leadId);
      if (!lead) return fail(`No lead with id ${leadId}.`);

      const outcome = await sendToLead(
        lead,
        template
          ? { kind: 'template', name: template, params: templateParams ?? [], body, lang: templateLanguage }
          : { kind: 'text', body },
      );

      // The row is written either way — see the note at the top of
      // src/lib/outbox.ts — so a failure still reports the message it left
      // on the timeline rather than pretending nothing happened.
      if (!outcome.ok) {
        return fail(
          outcome.error,
          outcome.message
            ? `A failed message row (id ${outcome.message.id}) is on the timeline, so the desk can see the attempt.`
            : undefined,
        );
      }

      await publish(leadId);

      return ok({
        sent: true,
        leadId,
        to: lead.phone,
        via: template ? `template "${template}"` : 'freeform reply',
        message: {
          id: outcome.message.id,
          body: outcome.message.body,
          status: outcome.message.status,
          at: outcome.message.createdAt.toISOString(),
        },
      });
    },
  );

  server.registerTool(
    'lead_funnel',
    {
      title: 'How the pipeline is converting',
      description:
        'Enquiries over a window, counted through the funnel: how many came in, how many were ' +
        'answered and how fast, how many wrote back, how many booked a trial, turned up and ' +
        'joined — plus where they came from and what the WhatsApp number has sent. Two steps ' +
        'count "at or past this stage", because the board keeps only a lead\'s current stage.',
      inputSchema: {
        withinDays: z
          .number()
          .int()
          .min(0)
          .default(30)
          .describe('Window in days. 0 means everything, ever.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ withinDays }) => {
      const now = new Date();
      const since = withinDays === 0 ? null : new Date(now.getTime() - withinDays * 86_400_000);

      const [all, totals, today] = await Promise.all([leadFacts(), messageTotals(since), sentToday()]);
      const facts = since ? all.filter((f) => f.createdAt >= since) : all;

      const answered = facts.filter((f) => f.firstOutboundAt);
      const waits = answered
        .map((f) => f.firstOutboundAt!.getTime() - f.createdAt.getTime())
        .filter((ms) => ms >= 0)
        .sort((a, b) => a - b);

      const bySource = new Map<string, number>();
      for (const f of facts) bySource.set(f.source, (bySource.get(f.source) ?? 0) + 1);

      const byCampaign = new Map<string, number>();
      for (const f of facts) {
        const key = f.campaign ?? '(none)';
        byCampaign.set(key, (byCampaign.get(key) ?? 0) + 1);
      }

      const joined = facts.filter((f) => f.stage === 'joined').length;

      return ok({
        window: withinDays === 0 ? 'everything' : `last ${withinDays} days`,
        enquiries: facts.length,
        answered: answered.length,
        stillWaitingOnAFirstReply: facts.filter((f) => !f.firstOutboundAt && f.stage !== 'lost').length,
        medianFirstReplyMinutes: waits.length === 0 ? null : Math.round(median(waits) / 60_000),
        wroteBack: facts.filter((f) => f.firstInboundAt).length,
        freeReplyWindowOpenNow: facts.filter((f) => replyWindow(f.lastInboundAt, now).open).length,
        // "At or past", not "at" — see the note on `reached`.
        reachedTrialBooked: facts.filter((f) => reached(f.stage, 'trial_booked')).length,
        reachedCameToTrial: facts.filter((f) => reached(f.stage, 'came_to_trial')).length,
        joined,
        lost: facts.filter((f) => f.stage === 'lost').length,
        conversion: facts.length === 0 ? null : `${Math.round((joined / facts.length) * 100)}%`,
        byStage: Object.fromEntries(
          LEAD_STAGES.map((s) => [s, facts.filter((f) => f.stage === s).length]),
        ),
        bySource: Object.fromEntries([...bySource].sort((a, b) => b[1] - a[1])),
        byCampaign: Object.fromEntries([...byCampaign].sort((a, b) => b[1] - a[1])),
        whatsapp: {
          ...totals,
          note: 'Freeform replies are free; templates are billable. "failed" is the figure to act on.',
          recipientsMessagedSinceMidnight: today,
        },
      });
    },
  );
}

/** One lead, with the reply window stated rather than left to be worked out. */
function describeLead(lead: LeadRow) {
  const window = replyWindow(lead.lastInboundAt);

  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    stage: lead.stage,
    source: lead.source,
    campaign: lead.campaign,
    owner: lead.owner,
    note: lead.note,
    playerId: lead.playerId,
    createdAt: lead.createdAt.toISOString(),
    lastInboundAt: lead.lastInboundAt?.toISOString() ?? null,
    lastOutboundAt: lead.lastOutboundAt?.toISOString() ?? null,
    whatsapp: window.open
      ? {
          canSendFreeform: true,
          closesIn: fmtWindowLeft(window.msLeft),
          closesAt: window.closesAt?.toISOString() ?? null,
        }
      : {
          canSendFreeform: false,
          reason: window.everWrote
            ? 'They last wrote more than 24 hours ago, so a freeform reply will be refused. Send an approved template.'
            : 'They have never messaged the club, so the first message out must be an approved template.',
        },
  };
}

/** Middle value, not mean: one enquiry answered three weeks late must not move the figure. */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
