import { applyStatus, recordInbound } from '@/lib/leads';
import { publish } from '@/lib/realtime';
import { parseWebhook, verifySignature, whatsappEnv } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

/**
 * Meta's webhook — everything WhatsApp tells us.
 *
 * Two kinds of notification arrive here: messages people sent the club's
 * number, and receipts for messages the club sent. Both matter, and the first
 * matters more than it looks: an inbound message is what opens the 24-hour
 * window, so this endpoint being down does not merely delay a notification,
 * it silently takes away the desk's ability to reply freely.
 *
 * ── Why it always answers 200 ────────────────────────────────────────────
 *
 * Meta retries anything that is not a 2xx, backing off, for a day. That is
 * the right behaviour for a delivery we failed to write down, and exactly the
 * wrong behaviour for a payload we will never understand — the retries cannot
 * succeed and simply repeat forever. So: a signature that does not verify is
 * a 403, a body that is not JSON is a 400, and everything past that point is
 * a 200 with the trouble logged. Anything genuinely lost is recoverable from
 * the conversation on the phone itself; an endless retry loop is not.
 *
 * ── Setting it up ────────────────────────────────────────────────────────
 *
 * In development this needs a public HTTPS address; `cloudflared tunnel --url
 * http://localhost:3000` gives one in a second. Meta's App Dashboard →
 * WhatsApp → Configuration wants:
 *
 *   Callback URL   https://<host>/api/whatsapp/webhook
 *   Verify token   whatever WHATSAPP_VERIFY_TOKEN is set to
 *
 * then subscribe the app to the `messages` field. The GET below is the
 * handshake it performs at that moment.
 */

/** The subscription handshake. Meta calls this once, when the URL is saved. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expected = whatsappEnv().verifyToken;
  if (!expected) {
    console.error('webhook verify: WHATSAPP_VERIFY_TOKEN is not set.');
    return new Response('not configured', { status: 500 });
  }

  if (mode === 'subscribe' && token === expected && challenge) {
    // Meta wants the challenge echoed back as bare text, not JSON.
    return new Response(challenge, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }

  console.warn('webhook verify rejected:', { mode, matched: token === expected });
  return new Response('forbidden', { status: 403 });
}

/** Whether this process has already pointed out the missing account id. */
let noted = false;

export async function POST(request: Request) {
  // Read the body as text, not JSON: the signature is over the exact bytes
  // Meta sent, and re-serialising a parsed object would not reproduce them.
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), whatsappEnv().appSecret)) {
    console.warn('webhook: bad signature, dropped.');
    return new Response('forbidden', { status: 403 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('bad request', { status: 400 });
  }

  try {
    const { messages, statuses, accountId } = parseWebhook(body);

    // The one id Meta will not tell us any other way — see `parseWebhook`.
    // Said once per process, not once per delivery.
    if (accountId && !process.env.WHATSAPP_WABA_ID && !noted) {
      noted = true;
      console.log(
        `whatsapp: WHATSAPP_WABA_ID is unset. This account's id is ${accountId} — ` +
          'set it to read the approved template list.',
      );
    }

    for (const msg of messages) {
      const { lead, created, duplicate } = await recordInbound(msg);
      if (duplicate) continue;
      console.log(
        `whatsapp in: ${created ? 'new lead' : 'lead'} ${lead.id} (${lead.name}) — ${msg.text.slice(0, 80)}`,
      );
      // The reply is saved; now nudge any screen that is open. This is also
      // the moment the 24-hour window reopens, which a composer sitting in
      // its locked state very much needs to hear about.
      await publish(lead.id);
    }

    for (const s of statuses) {
      await applyStatus(s.waMessageId, s.status, s.error);
    }

    // Delivery receipts move the ticks under a bubble. One nudge for the
    // batch rather than one each — Meta sends them in bursts.
    if (statuses.length) await publish(null);
  } catch (err) {
    // Logged, not raised. See the note above on retries.
    console.error('webhook handling failed:', err);
  }

  return new Response('ok', { status: 200 });
}
