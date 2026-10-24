import { LINK_HOURS } from '@/lib/checkout';
import { createLead, leadByPhone } from '@/lib/leads';
import { isValidStart } from '@/lib/availability';
import { createPayment, openTrialFor, setSession } from '@/lib/payments';
import type { LeadSource } from '@/lib/pipeline';
import { TRIAL_FEE, TRIAL_WINDOW_DAYS } from '@/lib/pricing';
import { emailFor } from '@/lib/purchase';
import { publish } from '@/lib/realtime';
import { refreshAttempt } from '@/lib/settle';
import { normalisePhone } from '@/lib/roster';
import { closedOn } from '@/lib/schedule';
import { addDays, fmtTime24, isValidDate, nowLocal, weekdayOf } from '@/lib/time';
import { TRIAL_MINUTES, trialStartFree } from '@/lib/trial';
import { withAxiom } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * POST /api/trial — somebody off an ad asks for a paid trial session.
 *
 * Writes the lead and opens the payment, and nothing else. The USSD push is
 * the page's next call, to `POST /api/payments/:id/pay` — the same route
 * every other payment link uses — so there is one charging path in the app
 * and this file never learns how money moves.
 *
 * The response is the payment id, which is also its /pay link. Handing it to
 * whoever typed the number is the same bargain `/api/bookings` makes: the
 * person on the form is the one who will pay, and the worst a stranger can
 * do with somebody else's number is send them a USSD prompt they decline.
 *
 * ── Twice ────────────────────────────────────────────────────────────────
 * One live lead per number (`uniq_lead_phone`), and one open trial per lead.
 * Filling the form in again moves the open trial to the new time rather than
 * opening a second; if a prompt is genuinely still out (`refreshAttempt`
 * has asked Snippe), the page is sent to that payment and re-pushes it
 * rather than firing a second charge.
 */
export const POST = withAxiom(async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const input = read(body);
  if ('error' in input) return json({ error: input.error }, 400);

  // Advisory, like /book's grid: the court is only taken once they have paid.
  // But a time already gone is refused here rather than sold.
  try {
    if (!(await trialStartFree(input.date, input.start))) {
      return json({ error: 'That time has just been taken. Pick another.' }, 409);
    }
  } catch (err) {
    console.error('trial availability failed:', err);
    return json({ error: 'Something went wrong our end. Please try again.' }, 500);
  }

  try {
    let lead = await leadByPhone(input.phone);
    if (!lead) {
      lead =
        (await createLead({
          name: input.name,
          phone: input.phone,
          source: input.source,
          campaign: input.campaign,
          note: `Paid trial form. Asked for ${input.date} at ${fmtTime24(input.start)}.`,
        })) ??
        // Lost the race to a second tap; the winner's row is the lead.
        (await leadByPhone(input.phone));
      if (!lead) throw new Error(`lead for ${input.phone} neither created nor found`);
      await publish(null);
    }

    // A 'processing' trial may be an attempt Snippe gave up on days ago;
    // ask before deciding there is a prompt out.
    const found = await openTrialFor(lead.id);
    const open = found ? await refreshAttempt(found) : null;
    // Asking may reveal it was approved after all; that is their trial, paid.
    if (open?.status === 'successful') return json({ ok: true, id: open.id, status: open.status });
    if (open && (open.status === 'pending' || open.status === 'failed' || open.status === 'processing')) {
      const moved =
        open.status === 'processing' ||
        (open.sessionDate === input.date && open.sessionStart === input.start)
          ? open
          : await setSession(open.id, input.date, input.start);
      if (moved) return json({ ok: true, id: moved.id, status: moved.status });
    }

    const payment = await createPayment({
      purpose: 'trial',
      amount: TRIAL_FEE,
      leadId: lead.id,
      sessionDate: input.date,
      sessionStart: input.start,
      name: input.name,
      phone: input.phone,
      email: emailFor(null, String(lead.id)),
      expiresAt: new Date(Date.now() + LINK_HOURS * 3_600_000),
    });

    return json({ ok: true, id: payment.id, status: payment.status }, 201);
  } catch (err) {
    console.error('trial signup failed:', err);
    return json({ error: 'Something went wrong our end. Please try again.' }, 500);
  }
});

type Parsed = {
  name: string;
  phone: string;
  date: string;
  /** Minutes from local midnight. */
  start: number;
  source: LeadSource;
  campaign: string;
};

function read(body: Record<string, unknown>): Parsed | { error: string } {
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return { error: 'Please enter your full name.' };

  const phone = normalisePhone(String(body.phone ?? ''));
  if (phone === null) return { error: 'That phone number does not look right.' };
  if (!phone) return { error: 'We need your mobile money number.' };

  const date = String(body.date ?? '');
  const today = nowLocal().date;
  if (!isValidDate(date) || date <= today || date > addDays(today, TRIAL_WINDOW_DAYS)) {
    return { error: 'Pick a day for your session.' };
  }
  if (closedOn(weekdayOf(date))) return { error: 'The courts are closed that day. Pick another.' };

  const start = Number(body.start);
  if (!isValidStart(start, TRIAL_MINUTES)) return { error: 'Pick a time for your session.' };

  return {
    name,
    phone,
    date,
    start,
    source: sourceOf(body),
    campaign: clip(body.utm_campaign) || 'Trial session landing page',
  };
}

/**
 * Which platform the ad ran on. Meta's `{{site_source_name}}` macro gives
 * `fb`, `ig`, `msg` or `an`; hand-written links tend to spell it out. A
 * click id with no UTM at all is still Meta's.
 */
function sourceOf(body: Record<string, unknown>): LeadSource {
  const s = clip(body.utm_source).toLowerCase();
  if (s === 'ig' || s.includes('instagram')) return 'instagram';
  if (['fb', 'msg', 'an', 'meta'].includes(s) || s.includes('facebook')) return 'facebook';
  if (clip(body.fbclid)) return 'facebook';
  return 'other';
}

function clip(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, 120) : '';
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
