import { after } from 'next/server';

import { createLead } from '@/lib/leads';
import { notifyEnquiry, notifyEnv } from '@/lib/notify';
import { publish } from '@/lib/realtime';
import { normalisePhone } from '@/lib/roster';

/** The only session counts the form offers. */
const SESSIONS = [4, 8, 16, 20] as const;
type Sessions = (typeof SESSIONS)[number];

/**
 * POST /api/join — the membership form on the homepage.
 *
 * Public, deliberately: it is the front door. That has two consequences worth
 * stating, because neither is an oversight.
 *
 * The first is spam. `uniq_lead_phone` means the same number cannot make a
 * second live lead however many times the form is sent, so the cheap flood —
 * one person pressing the button — writes one row. A flood from many invented
 * numbers is still possible and is not defended here; if it ever happens the
 * answer is a rule at the edge, not a check in this file.
 *
 * The second is what we say back. A number already on the board returns the
 * same 201 as a fresh one. Saying "that number is already a lead" would let
 * anybody test numbers against the club's CRM one at a time, and the person
 * filling the form in is owed the same reassuring answer either way — they
 * asked to be contacted, and they will be.
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
    const saved = await createLead({
      name: input.name,
      phone: input.phone,
      email: input.email,
      source: 'other',
      campaign: 'Website membership form',
      note: input.note,
    });

    // `saved` is null when that number is already a live lead. Nothing to
    // announce in that case — the card the desk needs is already on the board.
    if (saved) {
      await publish(null);
      // After the response, not before it: the club's mail is not something
      // the visitor should be made to wait on, and it must not be able to
      // fail their enquiry either. Same treatment a booking gets.
      after(() =>
        notifyEnquiry(notifyEnv(), {
          name: input.name,
          phone: input.phone,
          email: input.email,
          sessions: input.sessions,
          withKid: input.withKid,
        }),
      );
    }

    return json({ ok: true }, 201);
  } catch (err) {
    console.error('membership enquiry failed:', err);
    return json({ error: 'Something went wrong our end. Please try again.' }, 500);
  }
}

type Parsed = {
  name: string;
  phone: string;
  email: string;
  sessions: Sessions;
  withKid: boolean;
  note: string;
};

/**
 * Validate what the form sent.
 *
 * The messages come back to a member of the public rather than to the desk,
 * so they say what to do about it and nothing about the machinery behind.
 */
function read(body: Record<string, unknown>): Parsed | { error: string } {
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return { error: 'Please enter your full name.' };

  const phone = normalisePhone(String(body.phone ?? ''));
  if (phone === null) return { error: 'That phone number does not look right.' };
  if (!phone) return { error: 'We need a phone number to reach you on.' };

  // Required here, unlike at the desk, where a walk-in genuinely may not
  // have one. Somebody typing into a form on their own phone does.
  const email = String(body.email ?? '').trim();
  if (!email) return { error: 'Please enter your email address.' };
  if (email.length > 160 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'That email address does not look right.' };
  }

  const sessions = Number(body.sessions);
  if (!isSessions(sessions)) return { error: 'Choose how many sessions a month.' };

  const withKid = body.withKid === true;

  // Free text rather than columns of its own. The desk reads this on the lead
  // card, and both answers are opening-conversation material rather than
  // anything the club filters or counts on. Give them columns the day
  // somebody wants "every enquiry bringing a child".
  const note = [
    'Membership enquiry from the website.',
    `Planning ${sessions} sessions a month.`,
    withKid ? 'Bringing a child.' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return { name, phone, email, sessions, withKid, note };
}

function isSessions(value: number): value is Sessions {
  return (SESSIONS as readonly number[]).includes(value);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
