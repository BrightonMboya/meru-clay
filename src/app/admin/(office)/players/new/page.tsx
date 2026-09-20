import AddMember from '@/components/admin/AddMember';
import { loadRoster } from '@/lib/admin/load';

export const dynamic = 'force-dynamic';

/**
 * Add a member.
 *
 * The roster comes down with the page for two reasons: the rail lists who is
 * still unranked, and the form needs today at the club rather than on the
 * operator's device. See the note at the top of src/lib/time.ts.
 */
export default async function AddMemberPage() {
  return <AddMember roster={await loadRoster()} />;
}
