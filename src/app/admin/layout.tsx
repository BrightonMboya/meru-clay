import type { Metadata } from 'next';
import Sidebar from '@/components/admin/Sidebar';
import { courtStatus } from '@/lib/admin/desk';
import { loadDesk } from '@/lib/admin/load';

/**
 * The club office shell: sidebar on the left, one scrolling column on the
 * right. Every admin screen sits inside this.
 *
 * It is its own visual world — white ground and Inter, against the marketing
 * site's cream and Fraunces. That is deliberate: this is a tool the coach uses
 * on a Monday morning, not a brochure. `font-ui` and the explicit white
 * background undo the cream body styling from globals.css.
 */
export const metadata: Metadata = {
  title: 'Club office — Meru Clay',
  // Staff-only, and listed nowhere.
  robots: { index: false, follow: false },
};

/**
 * The sidebar says whether each court is in play *right now*, which is read
 * from the database. Prerendering any admin route would freeze that at build
 * time, so the whole shell is rendered on request.
 */
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // `loadDesk` is request-memoised, so this shares its queries with the page.
  const desk = await loadDesk();

  return (
    <div className="flex min-h-screen w-full bg-white font-ui text-pine">
      <Sidebar
        courts={courtStatus(desk)}
        operator={{ initials: 'EK', name: 'Elias Kimaro', role: 'Head coach' }}
      />
      <main className="flex min-w-0 grow flex-col">{children}</main>
    </div>
  );
}
