import { requireOperatorApi } from '@/lib/admin/session';
import { COURTS } from '@/lib/availability';
import { classRoll, enrol } from '@/lib/enrolments';
import { classesOn } from '@/lib/schedule';
import { isValidDate, weekdayOf } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Club class registers.
 *
 * A class is named by the court and start minute it runs at on a date — see
 * src/lib/enrolments.ts — so both verbs take that triple and check it against
 * the weekly grid before touching the table. The class name is then taken from
 * the timetable rather than from the caller: the desk cannot invent a class,
 * and cannot misspell one that exists.
 *
 * ⚠️ Staff endpoint. Nothing under /api/desk is authenticated yet; see the
 * note in src/app/api/desk/route.ts.
 */

/** GET /api/desk/enrolments?date=&court=&start= — who is signed up to one class. */
export async function GET(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const asked = classAt(params.get('date'), Number(params.get('court')), Number(params.get('start')));
  if ('error' in asked) return json({ error: asked.error }, 400);

  const roll = await classRoll(asked.date, asked.court, asked.start);
  return json({ className: asked.className, count: roll.length, players: roll });
}

/** POST /api/desk/enrolments — sign a player up to a class. */
export async function POST(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const asked = classAt(body.date, Number(body.court), Number(body.start));
  if ('error' in asked) return json({ error: asked.error }, 400);

  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return json({ error: 'Enter a name.' }, 400);

  // Same latitude the desk gets on a booking: a scribbled number or none.
  const raw = String(body.phone ?? '').replace(/[\s-]/g, '');
  if (raw && !/^(\+?255|0)[67]\d{8}$/.test(raw)) {
    return json({ error: 'That phone number does not look right.' }, 400);
  }
  const phone = raw ? raw.replace(/^(\+?255|0)/, '+255') : '';

  try {
    // The fee comes off the timetable, never off the request: the desk can
    // sign somebody up, and cannot decide what a class costs.
    const placed = await enrol({ ...asked, className: asked.className, name, phone });
    if (!placed) return json({ error: 'That number already has a place in this class.' }, 409);
    return json(placed, 201);
  } catch (err) {
    console.error('enrolment failed:', err);
    return json({ error: 'Could not sign them up.' }, 500);
  }
}

/**
 * Resolve "the class at this court and minute on this date" against the weekly
 * grid, or say why there isn't one.
 */
function classAt(
  date: unknown,
  court: number,
  start: number,
):
  | { date: string; court: number; start: number; className: string; amount: number }
  | { error: string } {
  if (!isValidDate(date)) return { error: 'Pick a date.' };
  if (!COURTS.some((c) => c.id === court)) return { error: 'Unknown court.' };

  const running = classesOn(weekdayOf(date)).find((c) => c.court === court && c.start === start);
  if (!running) return { error: 'No class runs on that court at that time.' };

  return { date, court, start, className: running.name, amount: running.fee ?? 0 };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
