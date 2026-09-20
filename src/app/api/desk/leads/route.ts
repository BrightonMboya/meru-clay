import { loadLeadBoard } from '@/lib/admin/load';
import { requireOperatorApi } from '@/lib/admin/session';
import { createLead } from '@/lib/leads';
import {
  isPeriod,
  isSource,
  isStage,
  parseLimits,
  type LeadSource,
  type LeadStage,
  type Period,
} from '@/lib/pipeline';
import { publish } from '@/lib/realtime';
import { normalisePhone } from '@/lib/roster';

export const dynamic = 'force-dynamic';

/**
 * The lead pipeline.
 *
 * GET hands back the leads and the last line of each conversation together,
 * for the reason /api/desk/players does the same: the board's column counts
 * and the cards underneath them must be counted from one set of rows.
 *
 * ⚠️ Staff endpoint. Nothing under /api/desk is authenticated yet; see the
 * note in src/app/api/desk/route.ts. Like the roster, this one hands out
 * every lead's phone number in a single request.
 */
export async function GET(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  // The same filters the screen puts in its own URL, so a poll returns the
  // board the operator is actually looking at rather than all of it —
  // including `show`, which says how far each lane has been expanded. A
  // refresh that quietly collapsed the lane somebody was reading would be
  // worse than no refresh at all.
  const params = new URL(request.url).searchParams;
  const days = params.get('days');

  try {
    return json(
      await loadLeadBoard({
        campaign: params.get('campaign')?.trim() || null,
        days: isPeriod(days) ? (Number(days) as Period) : 30,
        search: params.get('q')?.trim() || null,
        owner: params.get('owner')?.trim() || null,
        limits: parseLimits(params.get('show')),
      }),
    );
  } catch (err) {
    console.error('leads failed:', err);
    return json({ error: 'Could not load the leads.' }, 500);
  }
}

/** POST /api/desk/leads — take an enquiry at the desk. */
export async function POST(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const input = read(body);
  if ('error' in input) return json({ error: input.error }, 400);

  try {
    const saved = await createLead(input);
    if (!saved) return json({ error: 'That number is already a live lead.' }, 409);

    // A new card on the board, for anyone else looking at it.
    await publish(null);

    return json(saved, 201);
  } catch (err) {
    console.error('add lead failed:', err);
    return json({ error: 'Could not add them.' }, 500);
  }
}

type Parsed = {
  name: string;
  phone: string;
  email: string | null;
  stage: LeadStage;
  source: LeadSource;
  campaign: string | null;
  note: string | null;
  owner: string | null;
};

/**
 * Validate what the form sent.
 *
 * The rule with teeth is the phone number. A lead with no number cannot be
 * messaged, and messaging them is the entire point of the screen — so unlike
 * the roster, where a blank number is a real state, here it is refused.
 */
function read(body: Record<string, unknown>): Parsed | { error: string } {
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return { error: 'Enter a name.' };

  const phone = normalisePhone(String(body.phone ?? ''));
  if (phone === null) return { error: 'That phone number does not look right.' };
  if (!phone) return { error: 'A lead needs a phone number — it is the WhatsApp address.' };

  if (body.stage !== undefined && !isStage(body.stage)) return { error: 'Unknown stage.' };
  if (body.source !== undefined && !isSource(body.source)) return { error: 'Unknown source.' };

  const email = String(body.email ?? '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'That email address does not look right.' };
  }

  return {
    name,
    phone,
    email: email || null,
    stage: isStage(body.stage) ? body.stage : 'new',
    source: isSource(body.source) ? body.source : 'other',
    campaign: String(body.campaign ?? '').trim() || null,
    note: String(body.note ?? '').trim() || null,
    owner: String(body.owner ?? '').trim() || null,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
