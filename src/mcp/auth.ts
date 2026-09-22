/**
 * Who may drive the club office over MCP.
 *
 * Two keys fit this door, and both are real credentials:
 *
 *   MCP_TOKEN        a bearer token, for a client configured once and left
 *                    running — Claude Code, Claude Desktop, a script.
 *   an operator session  the same cookie the /admin screens use, so a client
 *                    already signed in as staff needs no second secret.
 *
 * With MCP_TOKEN unset the first key does not exist and only a signed-in
 * operator gets in. That is the same default CRON_SECRET takes in
 * src/app/api/cron/payments/route.ts and for the same reason: these tools
 * book courts, message members and record money, so an absent secret must
 * close the door rather than open it.
 *
 * The comparison is constant-time. A token checked with `===` leaks its
 * length and then its prefix to anybody willing to time a few thousand
 * requests, which is a cheap thing to get right and an expensive thing to
 * get wrong.
 */

import { timingSafeEqual } from 'node:crypto';

import { currentSession } from '@/lib/admin/session';

export type Caller =
  | { ok: true; as: 'token' }
  | { ok: true; as: 'operator'; email: string }
  | { ok: false; error: string };

export async function authorise(request: Request): Promise<Caller> {
  const expected = process.env.MCP_TOKEN;
  const presented = bearer(request.headers.get('authorization'));

  if (expected && presented && matches(presented, expected)) {
    return { ok: true, as: 'token' };
  }

  const session = await currentSession();
  if (session) return { ok: true, as: 'operator', email: session.user.email };

  return {
    ok: false,
    error: expected
      ? 'Not authorised. Send the club\'s MCP token as "authorization: Bearer <token>", or sign in as an operator.'
      : 'Not authorised. MCP_TOKEN is not set on this deployment, so only a signed-in operator can use these tools.',
  };
}

function bearer(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** Constant-time, and length-safe: `timingSafeEqual` throws on a mismatch. */
function matches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
