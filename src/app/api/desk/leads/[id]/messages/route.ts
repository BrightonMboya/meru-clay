import { getLead } from '@/lib/leads';
import { sendToLead, type SendRequest } from '@/lib/outbox';
import { replyWindow } from '@/lib/pipeline';
import { publish } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

/**
 * POST /api/desk/leads/:id/messages — say something to a lead.
 *
 * Two bodies are accepted:
 *
 *   { body: "…" }                                       freeform, in window
 *   { template: "name", lang: "en", params: [], body: "…" }  a template
 *
 * A refusal here is a 422 rather than a 400: the request is well formed and
 * the desk did nothing wrong — WhatsApp's clock simply says no. The message
 * that comes back is written to be shown to a person as-is.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/desk/leads/[id]/messages'>) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return json({ error: 'Unknown lead.' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const text = String(body.body ?? '').trim();
  if (!text) return json({ error: 'Write something first.' }, 400);
  if (text.length > 4096) return json({ error: 'WhatsApp caps a message at 4096 characters.' }, 400);

  const template = String(body.template ?? '').trim();
  const params = Array.isArray(body.params) ? body.params.map((p) => String(p)) : [];
  const lang = String(body.lang ?? '').trim() || undefined;

  const req: SendRequest = template
    ? { kind: 'template', name: template, params, body: text, lang }
    : { kind: 'text', body: text };

  try {
    const lead = await getLead(id);
    if (!lead) return json({ error: 'Unknown lead.' }, 404);

    const sent = await sendToLead(lead, req);

    // Either way a row was written, so any other screen on this lead is now
    // out of date — including the one showing a send that just failed.
    await publish(lead.id);

    if (!sent.ok) {
      // The row, when there is one, so the timeline can show the attempt.
      return json({ error: sent.error, message: sent.message ?? null }, 422);
    }

    // The window as it stands after the send — unchanged by our own message,
    // but the composer re-reads it and should not have to guess.
    return json({ message: sent.message, window: replyWindow(lead.lastInboundAt) }, 201);
  } catch (err) {
    console.error('send to lead failed:', err);
    return json({ error: 'Could not send it.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
