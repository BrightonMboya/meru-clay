import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Sidebar from '@/components/admin/Sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { courtStatus } from '@/lib/admin/desk';
import { loadDesk, loadOperator } from '@/lib/admin/load';
import { operatorFromSession, requireOperator } from '@/lib/admin/session';

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
  // The lock. src/proxy.ts turns most signed-out traffic around before it gets
  // this far, but a matcher is a configuration and this is the code path every
  // office screen actually runs through, so the question is asked again here.
  // Nothing below this line loads for someone who is not signed in.
  await requireOperator();

  // `loadDesk` is request-memoised, so this shares its queries with the page.
  // `operatorFromSession` reuses the session `requireOperator` just read.
  const [desk, sessionOperator, fallback, jar] = await Promise.all([
    loadDesk(),
    operatorFromSession(),
    loadOperator(),
    cookies(),
  ]);
  const operator = sessionOperator ?? fallback;

  // Whether the rail was left open, read on the server so a collapsed rail
  // renders collapsed rather than flashing its full width and snapping shut
  // once the client picks the cookie up. The name is shadcn's own.
  const open = jar.get('sidebar_state')?.value !== 'false';

  return (
    <TooltipProvider>
      <SidebarProvider
        defaultOpen={open}
        className="bg-white font-ui text-pine"
        // 248px, as drawn. shadcn's own default is 256.
        style={{ '--sidebar-width': '15.5rem' } as React.CSSProperties}
      >
        {/* The operator row now names whoever is signed in. It used to guess —
            first a hard-coded coach, then the club's first coach off the
            roster — because there was no sign-in to ask. There is one now, and
            `loadOperator` stays only as the fallback for the moment between a
            session existing and a name being on it. */}
        <Sidebar courts={courtStatus(desk)} operator={operator} />
        <SidebarInset className="min-w-0">
          {/* On a phone the rail is a sheet with nothing on screen to open it,
              so the trigger lives here. Everything wider has the rail itself. */}
          <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 md:hidden">
            <SidebarTrigger className="text-neutral-500" />
            <span className="text-[13px] font-semibold leading-4 text-pine">Club office</span>
          </div>
          {children}
        </SidebarInset>
        {/* `theme` is passed here rather than edited into the generated
            component: it reads `next-themes`, which has no provider in this
            app and would fall through to "system" — a dark toast over a white
            office. The club has no dark mode. */}
        <Toaster theme="light" position="bottom-right" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
