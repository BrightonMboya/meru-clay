'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CourtStatus } from '@/lib/admin/desk';

/**
 * The club office nav. Fixed-width icon and badge slots either side of the
 * label keep every row's three columns in the same vertical lanes, whether or
 * not that row has a count.
 */
type NavItem = { label: string; href: string; count?: number; icon: React.ReactNode };

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
        count: 1,
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
        count: 5,
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
        count: 2,
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

export default function Sidebar({
  courts,
  operator,
}: {
  courts: CourtStatus[];
  operator: { initials: string; name: string; role: string };
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-[248px] shrink-0 flex-col gap-[30px] self-stretch border-r border-neutral-200 bg-white pb-[22px] pt-[26px]">
      {/* Brand */}
      <div className="flex items-center gap-[11px] px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-clay">
          <span className="text-[16px] font-bold leading-5 tracking-[-0.02em] text-white">M</span>
        </div>
        <div className="flex flex-col gap-px">
          <span className="text-[15px] font-semibold leading-[18px] tracking-[-0.01em] text-pine">
            Meru Clay
          </span>
          <span className="font-sans text-[11px] font-medium uppercase leading-[14px] tracking-[0.12em] text-neutral-500">
            Club office
          </span>
        </div>
      </div>

      {/* Nav */}
      {groups.map((group) => (
        <nav key={group.heading} className="flex flex-col gap-0.5 px-3">
          <div className={heading}>{group.heading}</div>
          {group.items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-[10px] rounded-md px-2 py-[9px] transition-colors ${
                  active ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                }`}
              >
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
                {/* Kept at a fixed width even when empty, so the labels and
                    counts across every row share two vertical lanes. */}
                <span className="flex h-[18px] w-[22px] shrink-0 items-center justify-end">
                  {item.count !== undefined && (
                    <span className="flex h-[18px] min-w-[22px] items-center justify-center rounded-full bg-clay px-1.5 text-[11px] font-semibold leading-[14px] text-white">
                      {item.count}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
      ))}

      <div className="min-h-10 grow" />

      {/* Courts right now */}
      <div className="flex flex-col gap-[9px] px-5 pb-[18px]">
        <div className="text-[11px] font-semibold uppercase leading-[14px] tracking-[0.14em] text-neutral-400">
          Courts right now
        </div>
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

      {/* Operator */}
      <button
        type="button"
        className="flex items-center gap-[10px] border-t border-neutral-200 px-5 pt-4 text-left"
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold leading-[14px] tracking-[0.04em] text-neutral-600">
          {operator.initials}
        </span>
        <span className="flex grow flex-col gap-px">
          <span className="text-[13px] font-semibold leading-4 text-pine">{operator.name}</span>
          <span className="text-[11px] font-medium leading-[14px] tracking-[0.04em] text-neutral-500">
            {operator.role}
          </span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0 text-neutral-400"
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
      </button>
    </aside>
  );
}
