import 'server-only';

/**
 * Telling open screens that something changed.
 *
 * ── Why this file is so small ────────────────────────────────────────────
 *
 * It is a seam, on purpose. The club is not committed to a host yet, and
 * every host's answer to "push a message to a browser" is different and
 * incompatible: Supabase has Realtime, Cloudflare has Durable Objects with
 * WebSocket hibernation, Vercel has WebSocket functions plus a Redis broker.
 *
 * So the rest of the app knows only `publish(leadId)`, and its opposite,
 * `useLeadChanges` in src/hooks/use-lead-changes.ts. Moving to Cloudflare
 * means rewriting those two files and nothing else.
 *
 * ── Why it sends an id and not the message ───────────────────────────────
 *
 * A broadcast carries only "lead 4 changed". The browser hears it and
 * re-fetches through our own API, which is the thing that already decides
 * what a screen may see.
 *
 * That is deliberate. The alternative — putting the conversation in the
 * broadcast — would mean private messages and phone numbers travelling over
 * a channel that anything holding the public key can join. Sending an id
 * costs one extra round trip and means the realtime channel never carries
 * anything worth stealing.
 *
 * ── Why a failure here is swallowed ──────────────────────────────────────
 *
 * This runs after a message is already saved. If the nudge is lost the
 * screen still catches up on its next poll, a few seconds later — so a
 * broken broadcast must never turn a message that WAS received into a
 * request that failed. Logged, never thrown.
 */

const TOPIC = 'leads';

type Env = { url: string; key: string };

function env(): Env | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // The secret key, server-side only. Falls back to the publishable one,
  // which can also broadcast — handy before the secret has been set.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

/**
 * Say that a lead's conversation moved.
 *
 * `leadId` null means "the board changed but no one conversation did" — a
 * new lead arriving, say. Screens showing the board refresh; open threads
 * ignore it.
 */
export async function publish(leadId: number | null): Promise<void> {
  const e = env();
  if (!e) return; // Not configured. Screens fall back to polling.

  try {
    const res = await fetch(`${e.url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: e.key,
        authorization: `Bearer ${e.key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ topic: TOPIC, event: 'changed', payload: { leadId } }],
      }),
    });

    if (!res.ok) {
      console.error(`realtime broadcast ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error('realtime broadcast failed:', err);
  }
}
