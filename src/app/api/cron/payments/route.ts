import { timingSafeEqual } from 'node:crypto';

import { fulfil } from '@/lib/fulfil';
import { notifyPaymentProblem, notifyEnv } from '@/lib/notify';
import { RESEND_MINUTES, renewalLink } from '@/lib/paylink';
import {
  closeUnresolved,
  expireAbandoned,
  hasEvent,
  markUnfulfillable,
  playersAwaitingPayment,
  recordEvent,
  stalled,
  unaskable,
  unfulfilled,
} from '@/lib/payments';
import { settle } from '@/lib/settle';
import { dueBy } from '@/lib/players';
import { addDays, nowLocal } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/payments — everything that has to happen on a clock.
 *
 * `next.config.ts` says this app "deploys to any Node host" and there is no
 * platform scheduler committed to the repo, so the schedule itself lives
 * wherever the club deploys — Vercel Cron, a Cloudflare trigger, an external
 * pinger. This is a plain authenticated endpoint so that all three work.
 *
 * Two jobs, on two schedules:
 *
 *   ?job=sweep      every 15 minutes  (the default)
 *   ?job=reminders  once a day, in the morning
 *   ?job=all        both, for a host that can only run one schedule
 *
 * The sweep is the safety net under the rest of the payment system:
 *
 *   EXPIRE   — links nobody used, closed off so the ledger does not fill
 *              with payments that are permanently "not started".
 *   RETRY    — fulfilment that failed for a transient reason. A court that
 *              was genuinely resold is skipped: retrying cannot fix it and
 *              the desk has already been told.
 *
 *   VERIFY   — the important one, and the safety net under the webhook. A
 *              payer who approves a prompt and is never reported to us —
 *              webhook misconfigured, five delivery attempts all landing
 *              while the site was down, Snippe having a bad hour — leaves a
 *              payment stuck at 'processing' that nobody would ever find
 *              out about. Anything quiet for ten minutes is re-verified
 *              against Snippe's own API and settled through exactly the
 *              same `settle` the webhook uses.
 *   ORPHANS  — and the handful the verify step cannot help: a charge whose
 *              HTTP response we lost, so we never learned Snippe's
 *              reference and have nothing to ask about. Those are reported
 *              to the club, because a person with the Snippe dashboard open
 *              settles in a minute what this system cannot ask at all —
 *              and closed a day later, so the link does not stay wedged.
 *
 * Every step is idempotent, so running it twice, or running `all` on a
 * five-minute schedule, is harmless.
 */
export async function POST(request: Request) {
  if (!authorised(request)) return new Response('unauthorised', { status: 401 });

  const job = new URL(request.url).searchParams.get('job') ?? 'sweep';
  const report: Record<string, unknown> = { job };

  try {
    if (job === 'sweep' || job === 'all') Object.assign(report, await sweep());
    if (job === 'reminders' || job === 'all') Object.assign(report, await reminders());
  } catch (err) {
    console.error('payment cron failed:', err);
    return json({ ...report, error: 'The sweep did not finish.' }, 500);
  }

  return json(report);
}

/**
 * A shared secret in an `authorization: Bearer` header.
 *
 * Refused outright when unset. This endpoint sends WhatsApp messages to
 * members and moves payments around, so an open default would be a way for
 * anyone who found the path to spam the club's roster.
 *
 * Compared with `timingSafeEqual`, like the two webhook verifiers.
 */
function authorised(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('CRON_SECRET is unset — refusing to run scheduled payment work.');
    return false;
  }

  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * How long a USSD prompt is left alone before we go and ask about it.
 *
 * Long enough that the payer is genuinely done — they have to find the
 * phone, read the prompt and type a PIN — and short enough that a webhook
 * that never arrives is caught within the quarter-hour. Snippe expires an
 * unapproved transaction after four hours, so asking earlier than that
 * legitimately returns 'pending' and costs nothing but a round trip.
 */
const QUIET_MINUTES = 10;

/**
 * How long an unresolvable payment is left open after the club is told.
 *
 * It has to be closed eventually — see `closeUnresolved`. A day is long
 * enough for somebody to have read the alarm and looked it up, and short
 * enough that the payer is not left staring at "check your phone" about a
 * prompt that was never sent.
 */
const GIVE_UP_HOURS = 24;

/** The timeline entry that means "the club has been told about this one". */
const ORPHAN_REPORTED = 'orphan.reported';

/**
 * Do one payment's worth of work without letting it stop the others.
 *
 * The sweep is a batch job over rows that are already in trouble, and one
 * of them throwing used to abort the whole handler: the steps after it never
 * ran at all, so a single payment that failed the same way every time could
 * starve fulfilment retries and orphan reports indefinitely. Nothing here is
 * worth that, and the next run will try again regardless.
 */
async function each<T extends { id: string }>(
  rows: T[],
  job: (row: T) => Promise<void>,
): Promise<number> {
  let failed = 0;
  for (const row of rows) {
    try {
      await job(row);
    } catch (err) {
      failed += 1;
      console.error(`sweep: payment ${row.id} threw:`, err);
    }
  }
  return failed;
}

/** Expire, verify, retry, and report what cannot be chased. See the header. */
async function sweep() {
  const now = Date.now();

  const expired = await expireAbandoned(new Date(now));

  /*
   * Payments that went quiet with a prompt out. Settled through the same
   * `settle` the webhook calls — one settlement path, whichever of the two
   * gets there first, and both are safe to lose the race.
   */
  const quiet = await stalled(new Date(now - QUIET_MINUTES * 60_000));
  let verified = 0;
  let stillOut = 0;
  const verifyFailed = await each(quiet, async (payment) => {
    if (!payment.providerRef) return;
    const result = await settle(payment.id, payment.providerRef, 'cron');
    if (result.outcome === 'fulfilled' || result.outcome === 'already') verified += 1;
    else if (result.outcome === 'pending') stillOut += 1;
  });

  // Paid, not delivered. `failureReason` tells the two cases apart: one was
  // set by `fulfil` refusing on purpose — the court is gone, and only a
  // person can settle that — and the other is a payment whose fulfilment
  // threw and never got to say anything. Only the second is worth retrying.
  const stuck = await unfulfilled();
  let retried = 0;
  const retryFailed = await each(stuck, async (payment) => {
    if (payment.failureReason) return;
    const result = await fulfil(payment.id);
    if (result.ok) retried += 1;
  });

  /*
   * The ones nobody can ask about — see the note on `unaskable`. Given an
   * hour rather than ten minutes, because the only thing that resolves one
   * is a person reading the Snippe dashboard and there is no point
   * interrupting them over a payment that is merely slow.
   */
  const orphans = await unaskable(new Date(now - 60 * 60_000));
  let reported = 0;
  const orphanFailed = await each(orphans, async (payment) => {
    /*
     * Told once and only once. This runs every fifteen minutes and the row
     * is never going to resolve itself, so without a record of having said
     * so the club would get the same message four times an hour until
     * somebody intervened.
     *
     * Asked of the timeline rather than of `failure_reason`, which is what
     * it used to be: /pay now writes a reason on the row the moment a charge
     * goes unanswered — so the payer's page can stop saying "check your
     * phone" — and reading that as "already reported" would have meant the
     * club never heard about the one case this branch exists for.
     */
    if (await hasEvent(payment.id, ORPHAN_REPORTED)) return;

    const reason =
      'A payment request was sent but we never got a reference back for it, so it cannot be ' +
      'checked automatically. Look it up in the Snippe dashboard by the payer’s number.';

    await notifyPaymentProblem(notifyEnv(), payment, reason).catch((err) =>
      console.error(`orphan ${payment.id}: could not raise the alarm:`, err),
    );
    await recordEvent({
      paymentId: payment.id,
      source: 'cron',
      event: ORPHAN_REPORTED,
      amount: payment.amount,
      raw: reason,
    });
    // Left at 'processing' for now: marking it failed would tell the payer
    // their money bounced, and the whole point of this branch is that
    // nobody here knows whether it did. `closeUnresolved` shuts it a day
    // later, by which time the club has had the message.
    await markUnfulfillable(payment.id, reason);
    reported += 1;
  });

  /*
   * And the day after that, closed. Without this the row sits at
   * 'processing' for ever: `beginAttempt` refuses to start an attempt on
   * one, so the payer's link is dead while the page tells them a prompt is
   * on its way. 'abandoned' at least says something true, and the reason
   * the club was sent stays on the row.
   */
  const closed = await closeUnresolved(new Date(now - GIVE_UP_HOURS * 3_600_000));

  return {
    expired,
    verified,
    stillOut,
    retried,
    orphans: reported,
    closed,
    failed: verifyFailed + retryFailed + orphanFailed,
  };
}

/**
 * How far back a lapsed member is still chased.
 *
 * A month. Past that they have not renewed because they are not coming
 * back, and the club can ring them if it wants them.
 */
const CHASE_DAYS = 30;

/**
 * Renewal reminders.
 *
 * A window rather than two exact dates. It used to message only somebody
 * whose term ended precisely today or precisely a week out, which meant one
 * missed run — a deploy, a host asleep, a schedule that fired at the wrong
 * hour — dropped that member silently and for ever. Now anybody whose term
 * ends within the week, or ended within the last month, is in scope on
 * every run, and the cadence is controlled at the other end instead:
 *
 *   - `playersAwaitingPayment` skips anybody with a payment already in
 *     flight, which is everybody who was messaged while their link lives.
 *   - `RESEND_MINUTES` in src/lib/paylink.ts refuses to re-send inside an
 *     hour even if that first guard is somehow passed.
 *
 * So a member hears from the club roughly once per link lifetime — every
 * three days at worst — rather than either every morning or never.
 */
async function reminders() {
  const today = nowLocal().date;
  const weekOut = addDays(today, 7);
  const tooOld = addDays(today, -CHASE_DAYS);

  const [due, awaiting] = await Promise.all([dueBy(weekOut), playersAwaitingPayment()]);

  let reminded = 0;
  let quiet = 0;

  for (const player of due) {
    if (awaiting.has(player.id)) {
      quiet += 1;
      continue;
    }

    // `paidUntil` of null is somebody who has never paid, who is chased
    // today. Anybody who lapsed longer ago than `CHASE_DAYS` is left alone.
    const on = player.paidUntil;
    if (on !== null && on < tooOld) {
      quiet += 1;
      continue;
    }

    const result = await renewalLink(player.id, true, RESEND_MINUTES);
    if (result.ok && result.sent) reminded += 1;
    else if (result.ok) {
      quiet += 1;
      // A throttled send is the guard working, not a failure worth shouting.
      if (!result.throttled) {
        console.error(
          `reminder for player ${player.id} was not delivered` +
            (result.sendError ? ` — ${result.sendError}` : ''),
        );
      }
    }
  }

  return { due: due.length, reminded, quiet };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
