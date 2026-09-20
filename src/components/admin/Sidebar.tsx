'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/lib/auth-client';
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import type { CourtStatus } from '@/lib/admin/desk';

/**
 * The club office nav. The icon sits in a fixed-width slot so every row's
 * label starts in the same vertical lane.
 *
 * The rows carried a clay count badge in the design — a 1 on the court desk,
 * a 5 on matches, a 2 on leads. They were drawn numbers with nothing behind
 * them, and a badge that does not count anything is worse than no badge: it
 * reads as unattended work. Put one back when there is a figure to put in it.
 */
type NavItem = { label: string; href: string; icon: React.ReactNode };

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
  xmlns: 'http://www.w3.org/2000/svg',
} as const;

const groups: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Today',
    items: [
      {
        label: 'Court desk',
        href: '/admin',
        icon: (
          <svg {...iconProps}>
            <rect x="1.4" y="2.6" width="13.2" height="11" rx="1.6" />
            <path d="M1.4 6.4h13.2M8 6.4v7.2" />
          </svg>
        ),
      },
    ],
  },
  {
    heading: 'The club',
    items: [
      {
        label: 'Players',
        href: '/admin/players',
        icon: (
          <svg {...iconProps}>
            <circle cx="6" cy="5" r="2.7" />
            <path d="M1.6 13.6c0-2.4 2-4 4.4-4s4.4 1.6 4.4 4" strokeLinecap="round" />
            <path
              d="M11.2 3.1a2.4 2.4 0 0 1 0 4.5M12.4 13.6c0-1.7-.5-2.9-1.4-3.7"
              strokeLinecap="round"
            />
          </svg>
        ),
      },
      {
        label: 'Matches',
        href: '/admin/matches',
        icon: (
          <svg {...iconProps}>
            <path d="M2.2 3.4h4.2v9.2H2.2zM9.6 3.4h4.2v9.2H9.6z" strokeLinejoin="round" />
            <path d="M6.4 8h3.2" />
          </svg>
        ),
      },
      {
        label: 'Tournaments',
        href: '/admin/tournaments',
        icon: (
          <svg {...iconProps}>
            <path d="M4.6 2.2h6.8v3.4a3.4 3.4 0 0 1-6.8 0z" strokeLinejoin="round" />
            <path d="M8 9v2.6M5.4 13.8h5.2" strokeLinecap="round" />
            <path d="M4.6 3.2H2.8v1.2a2 2 0 0 0 1.8 2M11.4 3.2h1.8v1.2a2 2 0 0 1-1.8 2" />
          </svg>
        ),
      },
    ],
  },
  {
    heading: 'Growth',
    items: [
      {
        label: 'Leads',
        href: '/admin/leads',
        icon: (
          <svg {...iconProps}>
            <rect x="1.6" y="3.4" width="12.8" height="9.2" rx="1.4" />
            <path d="M2.4 4.6 8 8.8l5.6-4.2" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        label: 'Takings',
        href: '/admin/takings',
        icon: (
          <svg {...iconProps}>
            <path d="M2.4 13V9.2M6.8 13V4.4M11.2 13V6.8" strokeLinecap="round" />
            <path d="M1.6 13.6h12.8" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
];

const heading =
  'px-2 pb-2 text-[11px] font-semibold uppercase leading-[14px] tracking-[0.14em] text-neutral-400';

/**
 * The rail collapses.
 *
 * Expanded it is the nav as drawn — 248px, a crest, three labelled groups,
 * the courts and whoever is on the desk. Collapsed it is a 48px strip of
 * icons: the labels move into tooltips, the court readings and the
 * operator's name fold away, and the crest gives its place to the toggle so
 * there is still something to press. The state is shadcn's, which means it
 * also answers ⌘B, the drag rail on the edge, and a cookie that remembers
 * the choice across page loads — see `defaultOpen` in the admin layout.
 *
 * On a phone none of that applies: the same markup renders as a sheet over
 * the page, opened by the trigger in the inset's top bar.
 */
export default function Sidebar({
  courts,
  operator,
}: {
  courts: CourtStatus[];
  /** `email` is absent only on the signed-out fallback; see the office layout. */
  operator: { initials: string; name: string; role: string; email?: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function onSignOut() {
    setLeaving(true);
    await signOut();
    // `replace`, so the back button does not return to a screen the session
    // behind it no longer opens; `refresh` to drop the server-rendered shell
    // that still holds the old operator's name.
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <SidebarRoot collapsible="icon">
      <SidebarHeader className="pt-[22px] group-data-[collapsible=icon]:pt-3">
        <div className="flex items-center gap-[11px] px-2 group-data-[collapsible=icon]:px-0">
          {/* Both of these give way to the toggle when the rail is 48px
              wide — the crest is a detailed illustration and turns to noise
              at icon size, and a brand nobody can read is not a brand. */}
          <Image
            src="/images/meru-logo.png"
            alt=""
            width={34}
            height={40}
            priority
            className="h-10 w-auto shrink-0 group-data-[collapsible=icon]:hidden"
          />
          <div className="flex min-w-0 grow flex-col gap-px group-data-[collapsible=icon]:hidden">
            <span className="truncate text-[15px] font-semibold leading-[18px] tracking-[-0.01em] text-pine">
              Meru Clay
            </span>
            <span className="truncate font-sans text-[11px] font-medium uppercase leading-[14px] tracking-[0.12em] text-neutral-500">
              Club office
            </span>
          </div>
          <SidebarTrigger className="shrink-0 text-neutral-400 hover:text-pine group-data-[collapsible=icon]:mx-auto" />
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-[18px]">
        {groups.map((group) => (
          <SidebarGroup key={group.heading} className="py-0">
            <SidebarGroupLabel className={heading}>{group.heading}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      {/* The tooltip only shows itself while collapsed —
                          `SidebarMenuButton` hides it the rest of the time. */}
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={item.href} aria-current={active ? 'page' : undefined}>
                          <span
                            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center ${
                              active ? 'text-pine' : 'text-neutral-400'
                            }`}
                          >
                            {item.icon}
                          </span>
                          <span
                            className={`grow text-[15px] leading-[18px] ${
                              active ? 'font-semibold text-pine' : 'font-medium text-neutral-600'
                            }`}
                          >
                            {item.label}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-0 p-0 pb-[22px]">
        {/* Courts right now. A reading, not a control, so there is nothing
            useful to keep at icon width — it folds away entirely. */}
        <div className="flex flex-col gap-[9px] px-5 pb-[18px] group-data-[collapsible=icon]:hidden">
          <div className={heading.replace('px-2 pb-2 ', '')}>Courts right now</div>
          {courts.map((court) => (
            <div key={court.name} className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  court.free ? 'bg-pine' : 'bg-neutral-300'
                }`}
              />
              <span className="grow text-[13px] font-medium leading-4 text-neutral-600">
                {court.name} &nbsp;·&nbsp; {court.status}
              </span>
            </div>
          ))}
        </div>

        <SidebarSeparator className="mx-0 w-full" />

        <SidebarMenu className="px-2 pt-3 group-data-[collapsible=icon]:px-1">
          <SidebarMenuItem>
            {/* The chevron below was drawn as a disclosure from the start but
                had nothing to disclose until there was a session to end. */}
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={`${operator.name} · ${operator.role}`}
              // `size="lg"` is a 48px row, which is taller than the collapsed
              // rail is wide; without clamping it the initials and the name
              // spill out past the edge.
              className="gap-[10px] group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center"
            >
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold leading-[14px] tracking-[0.04em] text-neutral-600 group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7">
                {operator.initials}
              </span>
              <span className="flex min-w-0 grow flex-col gap-px group-data-[collapsible=icon]:hidden">
                <span className="truncate text-[13px] font-semibold leading-4 text-pine">
                  {operator.name}
                </span>
                <span className="truncate text-[11px] font-medium leading-[14px] tracking-[0.04em] text-neutral-500">
                  {operator.role}
                </span>
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="shrink-0 text-neutral-400 group-data-[collapsible=icon]:hidden"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4.4 5.6 7 8.2l2.6-2.6"
                  stroke="currentColor"
                  strokeWidth={1.3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate text-[13px] font-semibold leading-4 text-pine">
                  {operator.name}
                </span>
                <span className="block truncate text-[12px] font-normal leading-4 text-neutral-500">
                  {operator.email ?? operator.role}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={leaving}
                onSelect={(event) => {
                  // Keep the menu open while the request is in flight, so the
                  // row does not snap shut and look as though nothing happened.
                  event.preventDefault();
                  onSignOut();
                }}
              >
                {leaving ? 'Signing out…' : 'Sign out'}
              </DropdownMenuItem>
            </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* The draggable edge: click or drag it to toggle. */}
      <SidebarRail />
    </SidebarRoot>
  );
}
