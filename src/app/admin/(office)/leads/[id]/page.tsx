import { notFound } from 'next/navigation';
import LeadThread from '@/components/admin/LeadThread';
import { Screen } from '@/components/admin/ui';
import { loadLeadThread } from '@/lib/admin/load';

export const dynamic = 'force-dynamic';

export default async function LeadPage({ params }: PageProps<'/admin/leads/[id]'>) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const thread = await loadLeadThread(id);
  if (!thread) notFound();

  return (
    <Screen gap={32}>
      <LeadThread initial={thread} />
    </Screen>
  );
}
