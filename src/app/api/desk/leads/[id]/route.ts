import { loadLeadThread } from '@/lib/admin/load';
import { setStage } from '@/lib/leads';
import { isStage } from '@/lib/pipeline';
import { publish } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

/**
 * GET /api/desk/leads/:id — one lead, its whole conversation, and whether
 * the desk may currently type freely.
 *
 * Built by the same loader the page uses, so a thread that has just been
 * refreshed and one that was server-rendered are the same object. The reply
 * window is decided here rather than in the browser because the send endpoint
 * asks the same question, and the two answering differently is how a composer
 * comes to offer a message that cannot be sent.
 */
export async function GET(_request: Request, ctx: RouteContext<'/api/desk/leads/[id]'>) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return json({ error: 'Unknown lead.' }, 400);

  try {
    const thread = await loadLeadThread(id);
    if (!thread) return json({ error: 'Unknown lead.' }, 404);
    return json(thread);
  } catch (err) {
    console.error('lead failed:', err);
    return json({ error: 'Could not load the lead.' }, 500);
  }
}

/** PATCH /api/desk/leads/:id — move them along the board. */
export async function PATCH(request: Request, ctx: RouteContext<'/api/desk/leads/[id]'>) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return json({ error: 'Unknown lead.' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  if (!isStage(body.stage)) return json({ error: 'Unknown stage.' }, 400);

  try {
    const lead = await setStage(id, body.stage);
    if (!lead) return json({ error: 'Unknown lead.' }, 404);

    // The card moved between columns, and the open conversation's header
    // names the stage — so both have to hear about it. An id refreshes the
    // board for everyone and the thread for whoever has it open; see
    // src/hooks/use-lead-changes.ts.
    await publish(id);

    return json(lead);
  } catch (err) {
    console.error('move lead failed:', err);
    return json({ error: 'Could not move them.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
