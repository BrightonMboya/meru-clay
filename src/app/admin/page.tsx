import CourtDesk from '@/components/admin/CourtDesk';
import { loadDesk } from '@/lib/admin/load';

/**
 * Court desk — what is happening on both courts today.
 *
 * The day is read from Postgres here so it is in the first HTML response;
 * `CourtDesk` then keeps it live in the browser. Everything it draws comes
 * from the one `loadDesk` payload.
 */
export const dynamic = 'force-dynamic';

export default async function CourtDeskPage() {
  return <CourtDesk initial={await loadDesk()} />;
}
