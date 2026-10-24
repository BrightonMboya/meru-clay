import { LINK_HOURS } from '@/lib/checkout';
import { createLead, leadByPhone } from '@/lib/leads';
import { joiningLink, renewalLink } from '@/lib/paylink';
import { createPayment, openPackFor } from '@/lib/payments';
import { playerByPhone } from '@/lib/players';
import { MEMBERSHIP_TIERS, packOf, type PackSize } from '@/lib/pricing';
import { emailFor } from '@/lib/purchase';
import { publish } from '@/lib/realtime';
import { normalisePhone } from '@/lib/roster';
import { refreshAttempt } from '@/lib/settle';
import { errorFields, log, withAxiom } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * POST /api/join — the membership form on the homepage.
 *
 * Membership is a pack of sessions paid up front (`SESSION_PACKS`), or the
 * Kids membership — a month of group classes, the `kids` tier — so this
 * opens a payment and nothing more — the same shape as /api/trial. The page
 * then sends the USSD prompt through the shared `/api/payments/:id/pay` and
 * moves to /pay/<id>. When the money lands, `fulfil` puts them on the roster
 * with the pack credited; see `applyPack` in src/lib/fulfil.ts.
 *
 * Who the payment is for:
 *
 *   already on the roster → a top-up, against their player row
 *   anybody else          → a lead (found or created), so an unpaid attempt
 *                           is still somebody on the board to follow up
 *
 * The response is the same either way — a payment id — so the form cannot be
 * used to test numbers against the roster. The person typing the number is
 * the one who will approve the prompt, and the worst a stranger can do with
 * somebody else's number is send them a prompt they decline.
 *
 * ── Twice ────────────────────────────────────────────────────────────────
 * Pressing Join again for the same pack reuses the open payment rather than
 * opening a second; if a prompt is genuinely still out (`refreshAttempt` has
 * asked Snippe), the page is sent to that payment instead of a new charge.
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
    if (input.plan === 'kids') return await joinKids(input);

    const pack = packOf(input.sessions)!;
    const player = await playerByPhone(input.phone);

    let target: { playerId: number } | { leadId: number };
    if (player) {
      target = { playerId: player.id };
    } else {
      let lead = await leadByPhone(input.phone);
      if (!lead) {
        lead =
          (await createLead({
            name: input.name,
            phone: input.phone,
            source: 'other',
            campaign: 'Website membership form',
            note: input.note,
          })) ??
          // Lost the race to a second tap; the winner's row is the lead.
          (await leadByPhone(input.phone));
        if (!lead) throw new Error(`lead for ${input.phone} neither created nor found`);
        await publish(null);
      }
      target = { leadId: lead.id };
    }

    const found = await openPackFor(target, pack.sessions);
    const open = found ? await refreshAttempt(found) : null;
    if (open && ['successful', 'pending', 'failed', 'processing'].includes(open.status)) {
      log.info('membership.checkout_reused', { paymentId: open.id, status: open.status, sessions: pack.sessions });
      return json({ ok: true, id: open.id, status: open.status });
    }

    const payment = await createPayment({
      purpose: 'pack',
      amount: pack.fee,
      sessions: pack.sessions,
      ...target,
      name: player?.name ?? input.name,
      phone: input.phone,
      email: emailFor(player?.email, input.phone.slice(-8)),
      expiresAt: new Date(Date.now() + LINK_HOURS * 3_600_000),
    });

    log.info('membership.checkout_opened', {
      paymentId: payment.id,
      sessions: pack.sessions,
      amount: pack.fee,
      topUp: player !== null,
      ...('leadId' in target ? { leadId: target.leadId } : { playerId: target.playerId }),
    });
    return json({ ok: true, id: payment.id, status: payment.status }, 201);
  } catch (err) {
    log.error('membership.checkout_failed', errorFields(err));
    return json({ error: 'Something went wrong our end. Please try again.' }, 500);
  }
});

/**
 * The Kids membership. A monthly tier rather than a pack, so it goes through
 * the same payment links the desk sends — `joiningLink` for a newcomer,
 * which puts them on the roster on `kids` once paid, and `renewalLink` for a
 * child already on it. Both reuse an open payment for the same money rather
 * than minting a second.
 *
 * The roster has one member per number, so a number already on it under
 * another membership cannot become a child's as well; the desk sorts that
 * out by hand.
 */
async function joinKids(input: Parsed): Promise<Response> {
  const player = await playerByPhone(input.phone);

  let result;
  if (player) {
    if (player.membership !== 'kids') {
      return json(
        {
          error:
            'That number is already a member. WhatsApp us on +255 782 628 288 and we will add your child.',
        },
        409,
      );
    }
    result = await renewalLink(player.id, false);
  } else {
    let lead = await leadByPhone(input.phone);
    if (!lead) {
      lead =
        (await createLead({
          name: input.name,
          phone: input.phone,
          source: 'other',
          campaign: 'Website membership form',
          note: input.note,
        })) ?? (await leadByPhone(input.phone));
      if (!lead) throw new Error(`lead for ${input.phone} neither created nor found`);
      await publish(null);
    }
    result = await joiningLink(lead.id, 'kids', false);
  }

  if (!result.ok) {
    log.warn('membership.kids_refused', { error: result.error });
    return json({ error: 'We could not open that payment. WhatsApp us and we will help.' }, 409);
  }

  // A reused payment may have a prompt that has since been answered.
  const payment = await refreshAttempt(result.payment);
  log.info('membership.checkout_opened', {
    paymentId: payment.id,
    tier: 'kids',
    amount: payment.amount,
    topUp: player !== null,
  });
  return json({ ok: true, id: payment.id, status: payment.status }, 201);
}

type Parsed = { name: string; phone: string; note: string } & (
  | { plan: 'pack'; sessions: PackSize }
  | { plan: 'kids' }
);

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
  if (!phone) return { error: 'We need your mobile money number.' };

  if (body.plan === 'kids') {
    const note = `Membership from the website. Chose ${MEMBERSHIP_TIERS.kids.label} (TSh ${MEMBERSHIP_TIERS.kids.fee.toLocaleString('en-US')} a month).`;
    return { name, phone, plan: 'kids', note };
  }

  const pack = packOf(Number(body.sessions));
  if (!pack) return { error: 'Choose how many sessions.' };

  const withKid = body.withKid === true;

  // Free text rather than a column: the desk reads it on the lead card, and
  // it is conversation material rather than anything the club counts on.
  const note = [
    'Membership from the website.',
    `Chose ${pack.label}.`,
    withKid ? 'Bringing a child.' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return { name, phone, plan: 'pack', sessions: pack.sessions, note };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
