import { requireOperatorApi } from '@/lib/admin/session';
import { cancelBooking, confirmBooking, markPaid } from '@/lib/bookings';

export const dynamic = 'force-dynamic';

const ACTIONS = ['confirm', 'cancel', 'paid', 'unpaid'] as const;
type Action = (typeof ACTIONS)[number];

/**
 * PATCH /api/desk/bookings/:id — the three decisions the desk makes about a row.
 *
 * `confirm` promotes a hold once the coach has said yes; `cancel` releases the
 * slot back onto the booking page; `paid` records that the player settled up.
 * Each is idempotent in the sense that matters — calling it twice leaves the
 * row in the state its name describes — but a no-op is reported honestly, so
 * confirming a hold that has already lapsed is a 409 rather than a shrug.
 *
 * ⚠️ Staff endpoint. Nothing under /api/desk is authenticated yet; see the
 * note in src/app/api/desk/route.ts.
 */
export async function PATCH(request: Request, ctx: RouteContext<'/api/desk/bookings/[id]'>) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  const { id } = await ctx.params;

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }

  const action = String(body.action ?? '') as Action;
  if (!ACTIONS.includes(action)) {
    return json({ error: `action must be one of ${ACTIONS.join(', ')}` }, 400);
  }

  try {
    const done = await run(id, action);
    if (!done) {
      return json({ error: 'That booking is no longer in a state this can change.' }, 409);
    }
    return json({ ok: true, id, action });
  } catch (err) {
    console.error(`booking ${action} failed:`, err);
    return json({ error: 'Could not update the booking.' }, 500);
  }
}

function run(id: string, action: Action): Promise<boolean> {
  switch (action) {
    case 'confirm':
      return confirmBooking(id);
    case 'cancel':
      return cancelBooking(id);
    case 'paid':
      return markPaid(id, true);
    case 'unpaid':
      return markPaid(id, false);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
