import Bookers from '@/components/admin/Bookers';
import { loadBookers } from '@/lib/admin/load';

export const dynamic = 'force-dynamic';

export default async function PlayersPage() {
  return <Bookers initial={await loadBookers()} />;
}
