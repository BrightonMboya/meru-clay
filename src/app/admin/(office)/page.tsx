import CourtDesk from '@/components/admin/CourtDesk';
import { loadDesk } from '@/lib/admin/load';

export const dynamic = 'force-dynamic';

export default async function CourtDeskPage() {
  return <CourtDesk initial={await loadDesk()} />;
}
