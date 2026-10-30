import { after } from 'next/server';
import { isValidStart } from '@/lib/availability';
import { createLead, leadByPhone, setStage } from '@/lib/leads';
import { notifyEnv, notifyFreeTrial } from '@/lib/notify';
import {
  CHILD_AGES,
  TRIAL_LEVELS,
  TRIAL_LEVEL_LABELS,
  type LeadSource,
  type TrialLevel,
  type TrialPlayer,
} from '@/lib/pipeline';
import { TRIAL_WINDOW_DAYS } from '@/lib/pricing';
import { publish } from '@/lib/realtime';
import { normalisePhone } from '@/lib/roster';
import { closedOn } from '@/lib/schedule';
import { addDays, fmtLongDay, fmtTime24, isValidDate, nowLocal, weekdayOf } from '@/lib/time';
import { TRIAL_MINUTES, TRIALS_PER_NUMBER, bookFreeTrial, trialStartFree } from '@/lib/trial';
import { withAxiom } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * POST /api/trial — somebody off an ad books a free trial session.
 *
 * Free, so there is nothing to wait for: the lead is written, the trial
 * takes its court there and then, and the club is emailed who is coming.
 * Most are a parent booking a child, so the form asks for the child's name,
 * age and anything the coach should know, and the parent is the lead — the
 * number the club WhatsApps.
 *
 * ── Twice ────────────────────────────────────────────────────────────────
 * One live lead per number (`uniq_lead_phone`). The same form sent twice is
 * the same trial (`bookFreeTrial` finds it); a second child from the same
 * parent is a second trial, up to `TRIALS_PER_NUMBER` still to come.
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

  try {
    if (!(await trialStartFree(input.date, input.start))) {
      return json({ error: 'That time has just been taken. Pick another.' }, 409);
    }

    let lead = await leadByPhone(input.phone);
    if (!lead) {
      lead =
        (await createLead({
          name: input.name,
          phone: input.phone,
          source: input.source,
          campaign: input.campaign,
          note:
            input.player === 'child'
              ? `Free kids trial form, for ${input.childName} (${input.childAge}).`
              : 'Free trial form.',
        })) ??
        // Lost the race to a second tap; the winner's row is the lead.
        (await leadByPhone(input.phone));
      if (!lead) throw new Error(`lead for ${input.phone} neither created nor found`);
    }

    const booked = await bookFreeTrial({ leadId: lead.id, ...input });
    if (!booked.ok) {
      return booked.reason === 'taken'
        ? json({ error: 'That time has just been taken. Pick another.' }, 409)
        : json(
            {
              error: `You already have ${TRIALS_PER_NUMBER} sessions booked. WhatsApp us to add another.`,
            },
            429,
          );
    }

    if (!booked.repeat) {
      if (lead.stage === 'new' || lead.stage === 'contacted') await setStage(lead.id, 'trial_booked');
      const campaign = lead.campaign;
      after(async () => {
        await publish(lead.id).catch(() => {});
        await notifyFreeTrial(notifyEnv(), {
          name: input.name,
          phone: input.phone,
          day: fmtLongDay(input.date),
          when: `${fmtTime24(input.start)}–${fmtTime24(input.start + TRIAL_MINUTES)}`,
          court: booked.court,
          child:
            input.player === 'child' ? { name: input.childName!, age: input.childAge! } : null,
          level: TRIAL_LEVEL_LABELS[input.level],
          notes: input.notes,
          campaign,
        });
      });
    }

    return json({ ok: true, id: booked.trial.id }, booked.repeat ? 200 : 201);
  } catch (err) {
    console.error('trial booking failed:', err);
    return json({ error: 'Something went wrong our end. Please try again.' }, 500);
  }
});

type Parsed = {
  /** The grown-up: the parent when the trial is for a child. */
  name: string;
  phone: string;
  date: string;
  /** Minutes from local midnight. */
  start: number;
  player: TrialPlayer;
  childName: string | null;
  childAge: number | null;
  level: TrialLevel;
  notes: string | null;
  source: LeadSource;
  campaign: string;
};

function read(body: Record<string, unknown>): Parsed | { error: string } {
  const player: TrialPlayer = body.player === 'adult' ? 'adult' : 'child';

  let childName: string | null = null;
  let childAge: number | null = null;
  if (player === 'child') {
    childName = String(body.childName ?? '').trim();
    if (childName.length < 2 || childName.length > 80) return { error: "Please enter your child's name." };
    childAge = Number(body.childAge);
    if (!Number.isInteger(childAge) || childAge < CHILD_AGES.min || childAge > CHILD_AGES.max) {
      return { error: `Kids sessions are for ages ${CHILD_AGES.min} to ${CHILD_AGES.max}.` };
    }
  }

  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 80) {
    return { error: player === 'child' ? 'Please enter your own name.' : 'Please enter your full name.' };
  }

  const phone = normalisePhone(String(body.phone ?? ''));
  if (phone === null) return { error: 'That phone number does not look right.' };
  if (!phone) return { error: 'We need your WhatsApp number.' };

  const level = String(body.level ?? 'never');
  if (!(TRIAL_LEVELS as readonly string[]).includes(level)) return { error: 'Pick how much they have played.' };

  const notes = clip(body.notes, 500) || null;

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
    player,
    childName,
    childAge,
    level: level as TrialLevel,
    notes,
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

function clip(v: unknown, max = 120): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
