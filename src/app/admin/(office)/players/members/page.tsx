import Roster from '@/components/admin/Roster';
import { loadRoster } from '@/lib/admin/load';

export const dynamic = 'force-dynamic';

/**
 * The members roster — levels, memberships, session packs. Moved off
 * /admin/players, which now lists everybody who has booked; online membership
 * payments and /renew still write here.
 */
export default async function MembersPage() {
  return <Roster initial={await loadRoster()} />;
}
