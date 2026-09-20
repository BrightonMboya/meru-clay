import Roster from '@/components/admin/Roster';
import { loadRoster } from '@/lib/admin/load';

export const dynamic = 'force-dynamic';

export default async function PlayersPage() {
  return <Roster initial={await loadRoster()} />;
}
