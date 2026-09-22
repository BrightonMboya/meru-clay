import { after } from 'next/server';

import { RESEND_MINUTES, renewalLink } from '@/lib/paylink';
import { playerByPhone } from '@/lib/players';
import { normalisePhone } from '@/lib/roster';

export const dynamic = 'force-dynamic';

/**
 * POST /api/renew — a member asks for their own renewal link.
 *
 * ── The one rule ─────────────────────────────────────────────────────────
 * THE ANSWER IS THE SAME WHETHER OR NOT THE NUMBER IS A MEMBER.
 *
 * This is the same argument /api/join makes at length and it matters more
 * here. The route takes a phone number and is open to the world. If it said
 * "no such member" for one number and "link sent" for another, it would be
 * a free tool for testing numbers against the club's roster one at a time —
 * anyone could learn who plays here. So every well-formed number gets 200
 * and the same sentence, and what actually happens behind it is:
 *
 *   not a member          → nothing at all
 *   member, nothing due   → nothing at all
 *   pay as you play       → nothing at all (no term, so nothing to renew)
 *   messaged within the hour → nothing at all (the link is already on their
 *                           phone, and this endpoint is not a way to make
 *                           the club message somebody repeatedly)
 *   member with a term    → a link, to the number ON FILE
 *
 * The last point is the other half of the protection. The link is never
 * returned in the response and never sent to the number that was typed; it
 * goes to the number stored against the member, which for a legitimate
 * request is the same number and for a probe is somebody else's phone.
 *
 * The work happens in `after()` so that the response time does not differ
 * between a member and a stranger either. A faster 200 for unknown numbers
 * would leak exactly what the wording is careful not to.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const phone = normalisePhone(String(body.phone ?? ''));
  if (phone === null) return json({ error: 'That phone number does not look right.' }, 400);
  if (!phone) return json({ error: 'Enter the number you are a member on.' }, 400);

  after(async () => {
    try {
      const player = await playerByPhone(phone);
      if (!player) return;

      // `renewalLink` refuses a tier with no term of its own, and sends
      // only to the number on the roster row.
      //
      // Throttled, unlike the desk's own button: this route is open to the
      // world and anybody who knows a member's number could otherwise make
      // the club's WhatsApp number message them all afternoon. See
      // `RESEND_MINUTES`.
      const result = await renewalLink(player.id, true, RESEND_MINUTES);
      if (!result.ok) {
        console.log(`renew: nothing to send for player ${player.id} — ${result.error}`);
        return;
      }
      if (result.throttled) {
        // They asked twice. The first link is already on their phone.
        console.log(`renew: player ${player.id} was sent a link recently; not sending another.`);
      } else if (!result.sent) {
        // WhatsApp refused, almost certainly the 24-hour window with no
        // approved template configured. The member is left waiting, so
        // this has to be visible to somebody.
        console.error(
          `renew: link ${result.payment.id} for player ${player.id} was not delivered` +
            (result.sendError ? ` — ${result.sendError}` : ''),
        );
      }
    } catch (err) {
      console.error('renewal request failed:', err);
    }
  });

  // Always this, always 200. See the header.
  return json({
    ok: true,
    message:
      'If that number is a member with a subscription due, we have sent a payment link to it on WhatsApp.',
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
