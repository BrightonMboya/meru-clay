import type { Metadata } from 'next';
import Upcoming from '@/components/admin/Upcoming';
import { loadUpcoming } from '@/lib/admin/load';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Upcoming — Meru Clay' };

export default async function UpcomingPage() {
  return <Upcoming data={await loadUpcoming()} />;
}
