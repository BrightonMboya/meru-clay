import { LINK_HOURS } from '@/lib/checkout';
import { createLead, leadByPhone } from '@/lib/leads';
import { createPayment, openTrialFor, setSessionDate } from '@/lib/payments';
import type { LeadSource } from '@/lib/pipeline';
import { TRIAL_FEE, TRIAL_WINDOW_DAYS } from '@/lib/pricing';
import { emailFor } from '@/lib/purchase';
import { publish } from '@/lib/realtime';
import { normalisePhone } from '@/lib/roster';
import { addDays, isValidDate, nowLocal } from '@/lib/time';

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
 * Filling the form in again moves the open trial to the new day rather than
 * opening a second; if a prompt is already out, the page is sent to that
 * payment to wait for it instead of firing another.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const input = read(body);
  if ('error' in input) return json({ error: input.error }, 400);

  try {
    let lead = await leadByPhone(input.phone);
    if (!lead) {
      lead =
        (await createLead({
          name: input.name,
          phone: input.phone,
          source: input.source,
          campaign: input.campaign,
          note: `Paid trial form. Asked for ${input.date}.`,
        })) ??
        // Lost the race to a second tap; the winner's row is the lead.
        (await leadByPhone(input.phone));
      if (!lead) throw new Error(`lead for ${input.phone} neither created nor found`);
      await publish(null);
    }

    const open = await openTrialFor(lead.id);
    if (open) {
      const moved =
        open.status === 'processing' || open.sessionDate === input.date
          ? open
          : await setSessionDate(open.id, input.date);
      if (moved) return json({ ok: true, id: moved.id, status: moved.status });
    }

    const payment = await createPayment({
      purpose: 'trial',
      amount: TRIAL_FEE,
      leadId: lead.id,
      sessionDate: input.date,
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
}

type Parsed = {
  name: string;
  phone: string;
  date: string;
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

  return {
    name,
    phone,
    date,
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
