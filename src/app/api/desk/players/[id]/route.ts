import {
  deactivatePlayer,
  markMembershipPaid,
  setLevel,
  updatePlayer,
  type PlayerPatch,
} from '@/lib/players';
import { requireOperatorApi } from '@/lib/admin/session';
import { isMembership } from '@/lib/pricing';
import { isAvailability, isLevel, normalisePhone } from '@/lib/roster';
import { nowLocal } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/desk/players/:id — the roster's profile panel, one field at a time.
 *
 * Every key is optional and an absent key means "leave it alone", which is
 * what lets the panel fire a request per gesture — tap a level, tap a chip —
 * rather than making the operator fill in a form and press save.
 *
 * Three of them are not plain column writes and go through their own function
 * in src/lib/players.ts, because each has a rule attached: `level` keeps the
 * old one as history, `markPaid` extends a term rather than resetting it, and
 * both refuse a player who is no longer on the roster.
 *
 * ⚠️ Staff endpoint. Nothing under /api/desk is authenticated yet; see the
 * note in src/app/api/desk/route.ts.
 */
export async function PATCH(request: Request, ctx: RouteContext<'/api/desk/players/[id]'>) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return json({ error: 'Unknown player.' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const today = nowLocal().date;
  const patch: PlayerPatch = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 80) return json({ error: 'Enter a name.' }, 400);
    patch.name = name;
  }

  if (body.phone !== undefined) {
    const phone = normalisePhone(String(body.phone));
    if (phone === null) return json({ error: 'That phone number does not look right.' }, 400);
    patch.phone = phone;
  }

  if (body.email !== undefined) {
    const email = String(body.email ?? '').trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: 'That email address does not look right.' }, 400);
    }
    patch.email = email || null;
  }

  if (body.membership !== undefined) {
    if (!isMembership(body.membership)) return json({ error: 'Unknown membership.' }, 400);
    patch.membership = body.membership;
  }

  if (body.availability !== undefined) {
    if (!isAvailability(body.availability)) return json({ error: 'Unknown availability.' }, 400);
    patch.availability = body.availability;
  }

  const levelGiven = 'level' in body;
  if (levelGiven && body.level !== null && !isLevel(body.level)) {
    return json({ error: 'Unknown level.' }, 400);
  }

  try {
    // The plain columns first, so a level change that follows reads the row
    // as the operator has just left it.
    let row = await updatePlayer(id, patch);
    if (!row) return json({ error: 'That player is no longer on the roster.' }, 409);

    if (levelGiven) {
      row = await setLevel(id, isLevel(body.level) ? body.level : null, today);
      if (!row) return json({ error: 'That player is no longer on the roster.' }, 409);
    }

    if (body.markPaid === true) {
      row = await markMembershipPaid(id, today);
      if (!row) return json({ error: 'That player is no longer on the roster.' }, 409);
    }

    return json({ id: row.id, name: row.name });
  } catch (err) {
    // A number that already belongs to somebody else trips uniq_player_phone.
    if (isUniqueViolation(err)) {
      return json({ error: 'Another member already has that number.' }, 409);
    }
    console.error('player update failed:', err);
    return json({ error: 'Could not save that.' }, 500);
  }
}

/**
 * DELETE /api/desk/players/:id — take them off the roster.
 *
 * A soft delete: the row stays, because a past member is still the name
 * against last season's bookings. See `deactivatePlayer`.
 */
export async function DELETE(_request: Request, ctx: RouteContext<'/api/desk/players/[id]'>) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return json({ error: 'Unknown player.' }, 400);

  try {
    const done = await deactivatePlayer(id);
    if (!done) return json({ error: 'They are already off the roster.' }, 409);
    return json({ ok: true });
  } catch (err) {
    console.error('player removal failed:', err);
    return json({ error: 'Could not remove them.' }, 500);
  }
}

/**
 * Is this Postgres refusing a duplicate?
 *
 * Drizzle wraps the driver's error, so 23505 is not on the error it throws —
 * it is somewhere down the `cause` chain. Walking it is the difference
 * between the operator reading "another member already has that number" and
 * reading "could not save that", which tells them nothing and sends them
 * back to try the same number again.
 */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: string }).code === '23505') return true;
  }
  return false;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
