import Takings from '@/components/admin/Takings';
import { loadTakings } from '@/lib/admin/load';

export const dynamic = 'force-dynamic';

/**
 * Takings.
 *
 * Server-rendered from `loadTakings`, like the roster, so the ledger is on
 * screen before any browser request. The filtering below it is client-side
 * over the same payload — see the note in src/components/admin/Takings.tsx.
 */
export default async function TakingsPage() {
  return <Takings initial={await loadTakings()} />;
}
