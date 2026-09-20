import Invites from '@/components/admin/Invites';
import { listInvites } from '@/lib/admin/invites';

export const dynamic = 'force-dynamic';

/**
 * Invite a colleague.
 *
 * Inside the office, so the guard in the layout already applies: only a
 * signed-in operator can see this, and only one can call the endpoints
 * behind it. See src/app/api/desk/invites/route.ts.
 */
export default async function InvitePage() {
  return <Invites initial={await listInvites()} />;
}
