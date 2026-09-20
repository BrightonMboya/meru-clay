/**
 * Outbound notifications. All best-effort — a booking that is already
 * committed to the database must never be reported as failed because a
 * notification bounced. Failures are logged and swallowed.
 *
 * Three go out when a court is booked:
 *
 *   Club   -> email to BOOKING_TO_EMAIL. This is the one that must not be
 *             missed: until the WhatsApp template below is approved by Meta,
 *             it is the only way anyone at the club learns a court was booked.
 *   Coach  -> WhatsApp, via the Meta WhatsApp Cloud API. Silently skipped
 *             while its credentials are unset.
 *   Player -> confirmation email, only when they left an address.
 *
 * All three are sent in one small bounded batch rather than fanned out.
 *
 * A fourth goes to the same club inbox when somebody asks to join through
 * the homepage form — see `notifyEnquiry`. The lead row is the record; the
 * mail is only so that nobody has to be watching the board for it.
 *
 * ── About the mail transport ─────────────────────────────────────────────
 * Resend, over plain HTTP — one API key, no binding, nothing host-specific,
 * so this module works the same wherever the site is deployed. It also sends
 * without a domain of our own: the shared `onboarding@resend.dev` sender
 * works out of the box, at the cost of only delivering to the address that
 * owns the Resend account. Verify a domain with Resend to lift that, and
 * point BOOKING_FROM_EMAIL at an address on it.
 *
 * ── About WhatsApp ───────────────────────────────────────────────────────
 * WhatsApp will not let a business message someone out of the blue with
 * arbitrary text. There are two modes, and this module supports both:
 *
 *   template  — works any time, but the wording must be registered with Meta
 *               and approved first. Set WHATSAPP_TEMPLATE to the approved
 *               name. This is what production should use: a booking can land
 *               at any hour and must always reach the coach.
 *
 *   freeform  — plain text, allowed only within 24 hours of the recipient
 *               last messaging your business number. Used when
 *               WHATSAPP_TEMPLATE is unset. Good enough for testing: message
 *               the business number from the coach's phone, then book.
 *
 * The template must take four body parameters, in this order:
 *   {{1}} when      e.g. "2026-09-14, 5:30 – 6:30 PM"
 *   {{2}} court     e.g. "Court A"
 *   {{3}} player    e.g. "Asha Mollel · +255782441018"
 *   {{4}} extras    e.g. "With coach · Ref 22673b72"
 */

import { courtName } from './availability';
import type { Booking } from './bookings';
import { fmtRange } from './time';

export type NotifyEnv = {
  /**
   * Resend API key — without it no mail is sent at all. A secret:
   * .env.local locally, and set in the host's environment in production.
   */
  RESEND_API_KEY?: string;
  /** Meta system-user access token with whatsapp_business_messaging. */
  WHATSAPP_TOKEN?: string;
  /** Phone number ID of the sending WhatsApp Business number. */
  WHATSAPP_PHONE_ID?: string;
  /** Coach's number in E.164 without the leading +, e.g. 255673034433. */
  COACH_WHATSAPP?: string;
  /** Approved template name. Unset = send freeform (24-hour window only). */
  WHATSAPP_TEMPLATE?: string;
  /** Template language code, e.g. "en" or "en_US". Defaults to "en". */
  WHATSAPP_TEMPLATE_LANG?: string;
  /** Verified sender. Must be on a domain onboarded to Email Sending. */
  BOOKING_FROM_EMAIL?: string;
  /** Club inbox that every new booking is announced to. */
  BOOKING_TO_EMAIL?: string;
  CLUB_NAME?: string;
};

/**
 * The notification settings, read from the process environment. Listed one by
 * one rather than handing over `process.env` wholesale, so this file states
 * exactly which variables the club has to set — see .env.example.
 */
export function notifyEnv(): NotifyEnv {
  const e = process.env;
  return {
    RESEND_API_KEY: e.RESEND_API_KEY,
    WHATSAPP_TOKEN: e.WHATSAPP_TOKEN,
    WHATSAPP_PHONE_ID: e.WHATSAPP_PHONE_ID,
    COACH_WHATSAPP: e.COACH_WHATSAPP,
    WHATSAPP_TEMPLATE: e.WHATSAPP_TEMPLATE,
    WHATSAPP_TEMPLATE_LANG: e.WHATSAPP_TEMPLATE_LANG,
    BOOKING_FROM_EMAIL: e.BOOKING_FROM_EMAIL,
    BOOKING_TO_EMAIL: e.BOOKING_TO_EMAIL,
    CLUB_NAME: e.CLUB_NAME,
  };
}

const GRAPH_VERSION = 'v21.0';

/** Player-supplied text goes into HTML mail; escape it. */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** E.164 digits only — Meta rejects "+", spaces and dashes. */
function toE164Digits(raw: string): string {
  return raw.replace(/\D/g, '');
}

function describe(b: Booking): string {
  return `${b.date}, ${fmtRange(b.start_min, b.end_min)} — ${courtName(b.court_id)}`;
}

/** The four template parameters, also reused to build the freeform text. */
function coachFields(b: Booking) {
  const extras = [b.coach ? 'With coach' : 'Court only', `Ref ${b.id.slice(0, 8)}`];
  return {
    when: `${b.date}, ${fmtRange(b.start_min, b.end_min)}`,
    court: courtName(b.court_id),
    player: `${b.name} · ${b.phone}`,
    extras: extras.join(' · '),
  };
}

async function pingCoach(env: NotifyEnv, b: Booking): Promise<void> {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID || !env.COACH_WHATSAPP) return;

  const to = toE164Digits(env.COACH_WHATSAPP);
  const f = coachFields(b);

  const body = env.WHATSAPP_TEMPLATE
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: env.WHATSAPP_TEMPLATE,
          language: { code: env.WHATSAPP_TEMPLATE_LANG ?? 'en' },
          components: [
            {
              type: 'body',
              parameters: [f.when, f.court, f.player, f.extras].map((text) => ({
                type: 'text',
                text,
              })),
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: {
          body: [
            b.coach ? 'New booking — WITH COACH' : 'New court booking',
            f.when,
            f.court,
            f.player,
            f.extras,
          ].join('\n'),
        },
      };

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) throw new Error(`whatsapp ${res.status}: ${await res.text()}`);
}


/** A composed message, before either transport's field names are applied. */
export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Replies should reach the player, not the no-reply sender. */
  replyTo?: string;
};

/**
 * Send one email. Returns silently when mail is not configured — a club
 * running on WhatsApp alone is a valid setup, not an error.
 *
 * Exported because the office invitations (src/lib/auth.ts) send through the
 * same Resend account and the same sender. A second copy of this would be a
 * second place to fix when the club verifies a domain.
 */
export async function deliver(env: NotifyEnv, mail: Mail): Promise<void> {
  const from = env.BOOKING_FROM_EMAIL;
  if (!from || !env.RESEND_API_KEY) return;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: `${env.CLUB_NAME ?? 'Meru Clay'} <${from}>`,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);

  // Log the id Resend assigns: a send that is accepted but never arrives can
  // only be chased through their dashboard with it.
  const { id } = (await res.json().catch(() => ({}))) as { id?: string };
  console.log(`resend accepted ${id ?? '(no id)'} -> ${mail.to}`);
}

/**
 * Tell the club. Sent to BOOKING_TO_EMAIL with the player's address as
 * reply-to, so whoever picks it up can answer them in one click.
 */
async function emailClub(env: NotifyEnv, b: Booking): Promise<void> {
  if (!env.BOOKING_TO_EMAIL) return;

  const f = coachFields(b);
  const lines: Array<[string, string]> = [
    ['When', f.when],
    ['Court', f.court],
    ['Session', b.coach ? 'With coach' : 'Court only'],
    ['Player', b.name],
    ['Phone', b.phone],
    ['Email', b.email || '—'],
    ['Reference', b.id.slice(0, 8)],
  ];

  await deliver(env, {
    to: env.BOOKING_TO_EMAIL,
    // Answering the notification answers the player.
    ...(b.email ? { replyTo: b.email } : {}),
    subject: `${b.coach ? 'Booking + coach' : 'New booking'} — ${f.court}, ${f.when}`,
    text: [
      b.coach ? 'New booking, WITH COACH.' : 'New court booking.',
      '',
      ...lines.map(([k, v]) => `${k}: ${v}`),
      '',
      'The slot is held. Confirm with the player directly.',
    ].join('\n'),
    html: [
      `<p><strong>${b.coach ? 'New booking, with coach.' : 'New court booking.'}</strong></p>`,
      '<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font:15px system-ui,sans-serif">',
      ...lines.map(
        ([k, v]) =>
          `<tr><td style="color:#5F6B62;padding-right:18px">${k}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`,
      ),
      '</table>',
      '<p>The slot is held. Confirm with the player directly.</p>',
    ].join(''),
  });
}

/** Somebody asking to join, from the form on the homepage. */
export type Enquiry = {
  name: string;
  phone: string;
  email: string;
  sessions: number;
  withKid: boolean;
};

/**
 * Tell the club somebody wants to join.
 *
 * The lead row written before this is the record, and the board is where the
 * enquiry is actually worked — this is only so that joining is not something
 * the club finds out about by happening to look. Never throws, for the same
 * reason the booking notifications do not: the enquiry is already saved, and
 * a bounced mail must not turn it into an error the visitor sees.
 *
 * Silent while BOOKING_TO_EMAIL is unset, which is the same condition that
 * silences the booking notification.
 */
export async function notifyEnquiry(env: NotifyEnv, e: Enquiry): Promise<void> {
  if (!env.BOOKING_TO_EMAIL) return;

  const lines: Array<[string, string]> = [
    ['Name', e.name],
    ['Phone', e.phone],
    ['Email', e.email],
    ['Sessions a month', String(e.sessions)],
    ['Bringing a child', e.withKid ? 'Yes' : 'No'],
  ];

  try {
    await deliver(env, {
      to: env.BOOKING_TO_EMAIL,
      // Answering the notification answers them.
      replyTo: e.email,
      subject: `Membership enquiry — ${e.name}`,
      text: [
        'Somebody asked to join through the website.',
        '',
        ...lines.map(([k, v]) => `${k}: ${v}`),
        '',
        'They are on the leads board, in New.',
      ].join('\n'),
      html: [
        '<p><strong>Somebody asked to join through the website.</strong></p>',
        '<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font:15px system-ui,sans-serif">',
        ...lines.map(
          ([k, v]) =>
            `<tr><td style="color:#5F6B62;padding-right:18px">${k}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`,
        ),
        '</table>',
        '<p>They are on the leads board, in New.</p>',
      ].join(''),
    });
  } catch (err) {
    console.error('notify enquiry failed:', err);
  }
}

async function emailPlayer(env: NotifyEnv, b: Booking): Promise<void> {
  if (!b.email) return;

  const club = env.CLUB_NAME ?? 'Meru Clay';
  const when = describe(b);

  await deliver(env, {
    to: b.email,
    subject: `Your court at ${club} — ${b.date}`,
    text: [
      `Hi ${b.name},`,
      '',
      `Your court is held: ${when}.`,
      ...(b.coach ? ['', 'A coach is booked for this session.'] : []),
      '',
      'Oltrumet, Ngaramtoni — Arusha, at the foot of Mount Meru.',
      'Reply to this email or WhatsApp +255 782 628 288 to change anything.',
      '',
      `Reference: ${b.id.slice(0, 8)}`,
      '',
      `— ${club}`,
    ].join('\n'),
    html: [
      `<p>Hi ${escapeHtml(b.name)},</p>`,
      `<p>Your court is held:<br><strong>${when}</strong></p>`,
      b.coach ? '<p>A coach is booked for this session.</p>' : '',
      '<p>Oltrumet, Ngaramtoni — Arusha, at the foot of Mount Meru.</p>',
      '<p>Reply to this email or WhatsApp +255 782 628 288 to change anything.</p>',
      `<p style="color:#7E8C84">Reference: ${b.id.slice(0, 8)}</p>`,
      `<p>— ${club}</p>`,
    ].join(''),
  });
}

/**
 * Fire every notification. Never throws.
 * Pass the returned promise to `after()` from 'next/server' so the player is
 * not kept waiting on WhatsApp's or the mail pipeline's latency.
 */
export async function notifyBooking(env: NotifyEnv, b: Booking): Promise<void> {
  const jobs = {
    club: emailClub(env, b),
    coach: pingCoach(env, b),
    player: emailPlayer(env, b),
  };
  const results = await Promise.allSettled(Object.values(jobs));
  Object.keys(jobs).forEach((name, i) => {
    const r = results[i];
    if (r.status === 'rejected') console.error(`notify ${name} failed:`, r.reason);
  });
}
