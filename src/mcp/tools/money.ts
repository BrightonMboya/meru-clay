/**
 * The money — takings, the ledger, and sending somebody a payment link.
 *
 * Two distinctions run through every tool here and getting them the wrong
 * way round would make the numbers lies.
 *
 * Paid is not the same as fulfilled. `successful` means the money is the
 * club's, confirmed against the provider's own API. `fulfilled_at` means the
 * thing it bought actually happened — the court confirmed, the membership
 * extended, the class place settled. They are separate columns on purpose,
 * and a row with the first and not the second is the club's to-do list, not
 * an accounting error. `unresolved_payments` is that list.
 *
 * Owed is not a payment. Money owed is by definition money with no payment
 * row: an unpaid booking that has already happened, a member past their
 * date. So the two "still owed" figures in `takings_report` come from the
 * bookings and players tables, not the ledger, and could not be counted any
 * other way.
 *
 * `send_payment_link` reaches a real handset. It is the one tool here that
 * does something the club cannot take back.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { owedOnCourts } from '@/lib/bookings';
import { PAYMENT_PURPOSES, PAYMENT_STATUSES, PURPOSE_LABEL, isLive } from '@/lib/checkout';
import { classLink, joiningLink, payUrl, renewalLink } from '@/lib/paylink';
import {
  eventsFor,
  getPayment,
  listPayments,
  stalled,
  takings,
  unaskable,
  unfulfilled,
  type Payment,
} from '@/lib/payments';
import { MEMBERSHIPS, MEMBERSHIP_TIERS } from '@/lib/pricing';
import { dueBy } from '@/lib/players';
import { nowLocal, windowBounds } from '@/lib/time';

import { badWindow, dateWindow, fail, ok } from '../reply';

export function registerMoneyTools(server: McpServer) {
  server.registerTool(
    'takings_report',
    {
      title: 'What the club took',
      description:
        'Money in over a window, split by what it was for and how it arrived, plus the two ' +
        '"still owed" figures — unpaid courts that have already been played, and membership ' +
        'fees past their date. Owed money has no payment row, which is why it is counted from ' +
        'the bookings and roster rather than the ledger.',
      inputSchema: dateWindow,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ from, to }) => {
      const bad = badWindow(from, to);
      if (bad) return bad;

      const { start, end } = windowBounds(from, to);
      const today = nowLocal().date;

      const [total, ledger, courts, due] = await Promise.all([
        takings(start, end),
        listPayments(start, end),
        owedOnCourts(today),
        dueBy(today),
      ]);

      const settled = ledger.filter((p) => p.status === 'successful');
      const sum = (rows: Payment[]) => rows.reduce((n, p) => n + p.amount, 0);

      return ok({
        from,
        to,
        takenTotal: total,
        byPurpose: Object.fromEntries(
          PAYMENT_PURPOSES.map((purpose) => [
            purpose,
            {
              label: PURPOSE_LABEL[purpose],
              count: settled.filter((p) => p.purpose === purpose).length,
              amount: sum(settled.filter((p) => p.purpose === purpose)),
            },
          ]),
        ),
        byMethod: {
          online: sum(settled.filter((p) => p.method === 'online')),
          cash: sum(settled.filter((p) => p.method === 'cash')),
        },
        attempts: Object.fromEntries(
          PAYMENT_STATUSES.map((status) => [status, ledger.filter((p) => p.status === status).length]),
        ),
        stillInFlight: ledger.filter((p) => isLive(p.status)).length,
        // Money the club has but has not yet acted on. See the header.
        takenButNotFulfilled: settled.filter((p) => p.fulfilledAt === null).length,
        stillOwed: {
          onCourtsAlreadyPlayed: courts,
          onMembershipsPastTheirDate: due.reduce((n, p) => n + MEMBERSHIP_TIERS[p.membership].fee, 0),
          note: 'Club-wide as of today, not limited to the window — an old debt is still a debt.',
        },
      });
    },
  );

  server.registerTool(
    'list_payments',
    {
      title: 'The ledger',
      description:
        'Payments opened in a window, newest first. One row per thing being bought, not per ' +
        'attempt at buying it: a member whose first try fails and who then pays is one row ' +
        'with the attempt counter advanced, and the link the club sent them keeps working.',
      inputSchema: {
        ...dateWindow,
        status: z.enum(PAYMENT_STATUSES).optional().describe('Only payments at this status.'),
        purpose: z.enum(PAYMENT_PURPOSES).optional().describe('Only payments for this.'),
        limit: z.number().int().min(1).max(500).default(100).describe('How many to return.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ from, to, status, purpose, limit }) => {
      const bad = badWindow(from, to);
      if (bad) return bad;

      const { start, end } = windowBounds(from, to);
      const rows = (await listPayments(start, end)).filter(
        (p) => (!status || p.status === status) && (!purpose || p.purpose === purpose),
      );

      return ok({
        from,
        to,
        total: rows.length,
        returned: Math.min(rows.length, limit),
        payments: rows.slice(0, limit).map(describePayment),
      });
    },
  );

  server.registerTool(
    'get_payment',
    {
      title: 'One payment, with its audit trail',
      description:
        'A payment in full plus every word the provider said about it, oldest first. This is ' +
        'the audit trail, and it is what makes a disputed payment a question the club can answer.',
      inputSchema: {
        paymentId: z.string().describe('The payment id — also the last part of its /pay link.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ paymentId }) => {
      const payment = await getPayment(paymentId);
      if (!payment) return fail(`No payment with id "${paymentId}".`);

      const events = await eventsFor(paymentId);
      return ok({
        ...describePayment(payment),
        link: payUrl(payment.id),
        events: events.map((e) => ({
          event: e.event,
          source: e.source,
          status: e.status,
          at: e.receivedAt.toISOString(),
          amount: e.amount,
          providerRef: e.providerRef,
          raw: e.raw,
        })),
      });
    },
  );

  server.registerTool(
    'unresolved_payments',
    {
      title: 'Payments that need a person',
      description:
        'The three ways a payment gets stuck, kept apart because they need opposite treatment. ' +
        '"paidNotFulfilled": the money is in and the thing it bought has not happened — some ' +
        'of these retry themselves, some need a decision. "stalled": sent to a checkout and ' +
        'gone quiet, but re-verifiable against the provider. "unaskable": gone quiet with no ' +
        'provider reference, so nothing can ask about them and only somebody with the ' +
        'provider dashboard open can settle them.',
      inputSchema: {
        quietForMinutes: z
          .number()
          .int()
          .min(1)
          .default(30)
          .describe('How long a payment must have been silent to count as stalled.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ quietForMinutes }) => {
      const before = new Date(Date.now() - quietForMinutes * 60_000);

      const [pending, quiet, blind] = await Promise.all([
        unfulfilled(),
        stalled(before),
        unaskable(before),
      ]);

      return ok({
        paidNotFulfilled: {
          count: pending.length,
          note: 'A failureReason means fulfilment refused and a person must decide; a null one means it threw and will be retried.',
          payments: pending.map(describePayment),
        },
        stalled: {
          count: quiet.length,
          quietSince: before.toISOString(),
          note: 'Re-verifiable against the provider by reference.',
          payments: quiet.map(describePayment),
        },
        unaskable: {
          count: blind.length,
          note: 'No provider reference was ever recorded, so these cannot be looked up. They need the provider dashboard.',
          payments: blind.map(describePayment),
        },
      });
    },
  );

  server.registerTool(
    'send_payment_link',
    {
      title: 'Send somebody a payment link',
      description:
        'Open a payment and put its link on somebody\'s phone by WhatsApp. Three kinds: ' +
        '"renewal" for a member on the roster, "joining" for a lead who has not joined yet ' +
        '(name the tier they are buying), and "class" for a place already on a register. Set ' +
        'send: false to get the URL back without messaging anybody. A sent link reaches a real ' +
        'handset and cannot be recalled.',
      inputSchema: {
        kind: z.enum(['renewal', 'joining', 'class']).describe('What is being paid for.'),
        playerId: z.number().int().positive().optional().describe('Required for "renewal".'),
        leadId: z.number().int().positive().optional().describe('Required for "joining".'),
        enrolmentId: z.number().int().positive().optional().describe('Required for "class".'),
        tier: z.enum(MEMBERSHIPS).optional().describe('Required for "joining": the tier they are buying.'),
        send: z
          .boolean()
          .default(true)
          .describe('False returns the URL for somebody to read out or paste, and messages nobody.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ kind, playerId, leadId, enrolmentId, tier, send }) => {
      // Which target the kind requires is checked before anything is priced,
      // so a missing id is answered as a missing id rather than as whatever
      // the pricing layer makes of `undefined`.
      if (kind === 'renewal' && !playerId) return fail('"renewal" needs a playerId.');
      if (kind === 'joining' && !leadId) return fail('"joining" needs a leadId.');
      if (kind === 'joining' && !tier) {
        return fail(
          '"joining" needs the tier they are buying.',
          `One of ${MEMBERSHIPS.join(', ')} — club_context lists what each costs.`,
        );
      }
      if (kind === 'class' && !enrolmentId) return fail('"class" needs an enrolmentId.');

      const result =
        kind === 'renewal'
          ? await renewalLink(playerId!, send)
          : kind === 'joining'
            ? await joiningLink(leadId!, tier!, send)
            : await classLink(enrolmentId!, send);

      // `priceRenewal` and friends refuse for reasons the caller has to
      // hear — a pay-as-you-play member has nothing to renew, a free class
      // has nothing to pay for.
      if (!result.ok) return fail(result.error);

      return ok({
        kind,
        paymentId: result.payment.id,
        amount: result.amount,
        url: result.url,
        to: result.payment.phone || null,
        sent: result.sent,
        ...(result.throttled
          ? { throttled: true, note: 'Not sent because a link went to them recently. This is not a fault.' }
          : {}),
        ...(result.sendError ? { sendError: result.sendError } : {}),
        expiresAt: result.payment.expiresAt ? new Date(result.payment.expiresAt).toISOString() : null,
      });
    },
  );
}

/** One payment, with the paid/fulfilled distinction spelled out. */
function describePayment(p: Payment) {
  return {
    id: p.id,
    purpose: p.purpose,
    purposeLabel: PURPOSE_LABEL[p.purpose],
    status: p.status,
    method: p.method,
    amount: p.amount,
    currency: p.currency,
    name: p.name,
    phone: p.phone || null,
    tier: p.tier,
    bookingId: p.bookingId,
    playerId: p.playerId,
    leadId: p.leadId,
    enrolmentId: p.enrolmentId,
    attempt: p.attempt,
    providerRef: p.providerRef,
    createdAt: new Date(p.createdAt).toISOString(),
    paidAt: p.paidAt ? new Date(p.paidAt).toISOString() : null,
    // Money in is not the same as the thing bought having happened.
    fulfilledAt: p.fulfilledAt ? new Date(p.fulfilledAt).toISOString() : null,
    failureReason: p.failureReason,
    expiresAt: p.expiresAt ? new Date(p.expiresAt).toISOString() : null,
  };
}
