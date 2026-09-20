import { requireOperatorApi } from '@/lib/admin/session';
import { isOnRoster, recentFor, recordAttendance } from '@/lib/attendance';
import { nowLocal } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * POST /api/desk/attendance — mark one player present on one day.
 *
 * ⚠️ Staff endpoint. Nothing under /api/desk is authenticated yet; see the
 * note in src/app/api/desk/route.ts.
 */
export async function POST(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const today = nowLocal().date;
  const input = read(body, today);
  if ('error' in input) return json({ error: input.error }, 400);

  try {
    if (!(await isOnRoster(input.playerId))) {
      return json({ error: 'That player is not on the roster.' }, 404);
    }

    const written = await recordAttendance(input.playerId, input.date);
    return json({ date: input.date, recent: await recentFor(input.playerId), written }, 201);
  } catch (err) {
    console.error('record attendance failed:', err);
    return json({ error: 'Could not record it.' }, 500);
  }
}

/**
 * What the desk is allowed to say.
 *
 * The date is the only field with any judgement in it. A day in the future is
 * refused outright — attendance is a thing that happened — and so is anything
 * more than a season back, which in practice only ever means a mistyped year.
 */
function read(
  body: Record<string, unknown>,
  today: string,
): { playerId: number; date: string } | { error: string } {
  const playerId = Number(body.playerId);
  if (!Number.isInteger(playerId) || playerId <= 0) return { error: 'Pick a player.' };

  const date = typeof body.date === 'string' ? body.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Pick a date.' };
  if (date > today) return { error: 'That day has not happened yet.' };
  if (date < yearBefore(today)) return { error: 'That is more than a year ago — check the year.' };

  return { playerId, date };
}

function yearBefore(today: string): string {
  const [y, rest] = [today.slice(0, 4), today.slice(4)];
  return `${Number(y) - 1}${rest}`;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}
