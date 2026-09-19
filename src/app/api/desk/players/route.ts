import { loadRoster } from '@/lib/admin/load';
import { createPlayer } from '@/lib/players';
import { MEMBERSHIP_TIERS, isMembership, type MembershipTier } from '@/lib/pricing';
import {
  JUNIOR_AGE,
  isAvailability,
  isLevel,
  isRole,
  normalisePhone,
  type MaybeLevel,
  type PlayerAvailability,
  type PlayerRole,
} from '@/lib/roster';
import { addMonths, nowLocal } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * The club roster.
 *
 * GET hands back the whole screen's payload — rows, level tally, filter
 * counts, money outstanding — for the same reason /api/desk does: the number
 * at the top of the page and the list under it must be counted from one set
 * of rows, or they will eventually disagree.
 *
 * ⚠️ Staff endpoint. Nothing under /api/desk is authenticated yet; see the
 * note in src/app/api/desk/route.ts. This one hands out every member's phone
 * number in a single request, so it is the worst of them to leave open.
 */
export async function GET() {
  try {
    return json(await loadRoster());
  } catch (err) {
    console.error('roster failed:', err);
    return json({ error: 'Could not load the roster.' }, 500);
  }
}

/** POST /api/desk/players — add a member or a coach. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const input = read(body);
  if ('error' in input) return json({ error: input.error }, 400);

  const today = nowLocal().date;

  try {
    const saved = await createPlayer(
      {
        ...input,
        // A first payment taken at the desk starts the term today; everyone
        // else is due from the moment they are on the roster.
        paidUntil: paidUntilFor(input, today),
      },
      today,
    );

    if (!saved) return json({ error: 'That number is already on the roster.' }, 409);
    return json({ id: saved.id, name: saved.name }, 201);
  } catch (err) {
    console.error('add player failed:', err);
    return json({ error: 'Could not add them.' }, 500);
  }
}

type Parsed = {
  name: string;
  phone: string;
  email: string | null;
  role: PlayerRole;
  level: MaybeLevel;
  birthYear: number | null;
  guardianName: string | null;
  guardianPhone: string | null;
  membership: MembershipTier;
  availability: PlayerAvailability;
  paidNow: boolean;
  joinedOn?: string;
};

/**
 * Validate what the form sent.
 *
 * The one rule with teeth is the junior one: under 18 and the club needs a
 * guardian's number, because that is who it rings. The form asks for it, and
 * this is what makes the form's promise true even for a request that did not
 * come from the form.
 */
function read(body: Record<string, unknown>): Parsed | { error: string } {
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return { error: 'Enter a name.' };

  const phone = normalisePhone(String(body.phone ?? ''));
  if (phone === null) return { error: 'That phone number does not look right.' };

  const role = isRole(body.role) ? body.role : 'member';
  if (body.level !== undefined && body.level !== null && !isLevel(body.level)) {
    return { error: 'Unknown level.' };
  }
  const level: MaybeLevel = isLevel(body.level) ? body.level : null;

  const membership = isMembership(body.membership) ? body.membership : 'monthly';
  const availability = isAvailability(body.availability) ? body.availability : 'open';

  let birthYear: number | null = null;
  const age = body.age === null || body.age === undefined ? null : Number(body.age);
  if (age !== null) {
    if (!Number.isInteger(age) || age < 4 || age > 100) return { error: 'Enter a real age.' };
    birthYear = new Date().getUTCFullYear() - age;
  }

  const guardianPhoneRaw = String(body.guardianPhone ?? '');
  const guardianPhone = normalisePhone(guardianPhoneRaw);
  if (guardianPhone === null) return { error: "That guardian's number does not look right." };

  if (age !== null && age < JUNIOR_AGE && !guardianPhone) {
    return { error: 'A player under 18 needs a guardian’s phone number.' };
  }

  const email = String(body.email ?? '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'That email address does not look right.' };
  }

  return {
    name,
    phone,
    email: email || null,
    role,
    level,
    birthYear,
    guardianName: String(body.guardianName ?? '').trim() || null,
    guardianPhone: guardianPhone || null,
    membership,
    availability,
    paidNow: body.paidNow === true,
    joinedOn: typeof body.joinedOn === 'string' ? body.joinedOn : undefined,
  };
}

/**
 * A first payment taken at the desk starts the term today. Pay as you play
 * has no term, so it stays null — and never falls due either.
 */
function paidUntilFor(input: Parsed, today: string): string | null {
  const { months } = MEMBERSHIP_TIERS[input.membership];
  return input.paidNow && months > 0 ? addMonths(today, months) : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
