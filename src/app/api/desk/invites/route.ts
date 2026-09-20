import { headers } from 'next/headers';

import {
  isEmail,
  listInvites,
  normaliseEmail,
  recordInvite,
  revokeInvite,
  userExists,
} from '@/lib/admin/invites';
import { currentSession, requireOperatorApi } from '@/lib/admin/session';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Invitations to the club office.
 *
 * Staff only, like everything under /api/desk — and more so than most of it:
 * this endpoint is how someone becomes staff. See the note in
 * src/app/api/desk/route.ts.
 */

/** GET /api/desk/invites — the roll, for the invite screen. */
export async function GET() {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    return json({ invites: await listInvites() });
  } catch (err) {
    console.error('invites list failed:', err);
    return json({ error: 'Could not load the invitations.' }, 500);
  }
}

/**
 * POST /api/desk/invites — invite someone, and send them the link.
 *
 * Two things happen, in this order, and the order matters: the invitation is
 * written down first, then the magic link is requested. Better Auth's
 * `validateUserInfo` reads that row when the link is eventually followed, so
 * a link issued before the row existed would be refused at the door.
 */
export async function POST(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  const session = await currentSession();
  if (!session) return json({ error: 'Not signed in.' }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Expected JSON.' }, 400);
  }

  const email = normaliseEmail(String(body.email ?? ''));
  if (!email) return json({ error: 'An email address is needed.' }, 400);
  if (!isEmail(email)) return json({ error: 'That does not look like an email address.' }, 400);

  if (await userExists(email)) {
    return json({ error: 'Someone with that address is already an operator.' }, 409);
  }

  let invite;
  try {
    invite = await recordInvite({
      email,
      invitedBy: session.user.id,
      invitedByName: session.user.name.trim() || session.user.email,
    });
  } catch (err) {
    console.error('invite write failed:', err);
    return json({ error: 'Could not write the invitation down.' }, 500);
  }

  try {
    await auth.api.signInMagicLink({
      body: {
        email,
        // Better Auth puts this on the user it creates; without it the new
        // operator's name would be whatever the library falls back to.
        name: email.split('@')[0],
        callbackURL: '/admin',
        newUserCallbackURL: '/admin',
        // Where a refused link lands. The realistic refusal is an invitation
        // withdrawn or expired between sending the mail and opening it, and
        // /admin would bounce a signed-out visitor to the login screen and
        // drop the explanation on the way. Sending them straight there keeps
        // it: the page renders `error_description`.
        errorCallbackURL: '/admin/login',
      },
      headers: await headers(),
    });
  } catch (err) {
    // No mail went out, so leave nothing behind claiming otherwise: an
    // invitation still sitting there would read as sent on the screen and
    // quietly authorise an address nobody could actually use.
    console.error('invite send failed:', err);
    await revokeInvite(invite.id);
    return json(
      { error: 'The invitation could not be emailed. Check RESEND_API_KEY and try again.' },
      502,
    );
  }

  return json({ invite }, 201);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
