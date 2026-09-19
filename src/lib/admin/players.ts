/**
 * The club roster.
 *
 * ⚠️ DEMO DATA. There is no database yet (see the note at the top of
 * src/lib/bookings.ts). Everything below is the sample roster drawn in the
 * Paper file; when Supabase lands, replace `ROSTER` and `LEVEL_COUNTS` with
 * queries and every component on the screen keeps working unchanged.
 */

import { LEVELS, type Level } from '@/components/admin/ui';

export type Availability =
  | 'OPEN TO A GAME'
  | 'WEEKENDS ONLY'
  | 'EVENINGS ONLY'
  | 'JUNIOR SQUAD'
  | 'AWAY · DAR OPEN'
  | 'MEMBERSHIP DUE';

export type Player = {
  initials: string;
  name: string;
  /** Phone and joining year, or a junior's age and guardian. */
  sub: string;
  level: Level;
  /** Ladder record, wins–losses. */
  record: string;
  /** Places moved on the ladder since the last cycle. `null` for no change. */
  moved: number | null;
  lastPlayed: string;
  availability: Availability;
  /** The one thing this row offers to do. */
  action: 'Challenge' | 'Profile' | 'Remind';
};

export const ROSTER: Player[] = [
  {
    initials: 'JK',
    name: 'Juma Kimaro',
    sub: '+255 787 015 663 · member since 2024',
    level: 'Competitive',
    record: '14–3',
    moved: 2,
    lastPlayed: '2 days ago',
    availability: 'OPEN TO A GAME',
    action: 'Challenge',
  },
  {
    initials: 'NL',
    name: 'Neema Laizer',
    sub: '+255 769 220 745 · member since 2023',
    level: 'Club',
    record: '9–6',
    moved: 1,
    lastPlayed: 'Yesterday',
    availability: 'OPEN TO A GAME',
    action: 'Challenge',
  },
  {
    initials: 'DM',
    name: 'Daniel Massawe',
    sub: '+255 754 991 204 · member since 2025',
    level: 'Club',
    record: '4–5',
    moved: -1,
    lastPlayed: '6 days ago',
    availability: 'WEEKENDS ONLY',
    action: 'Challenge',
  },
  {
    initials: 'AM',
    name: 'Asha Mollel',
    sub: '+255 712 448 190 · member since 2022',
    level: 'Competitive',
    record: '11–4',
    moved: 3,
    lastPlayed: 'Today',
    availability: 'OPEN TO A GAME',
    action: 'Challenge',
  },
  {
    initials: 'FU',
    name: 'Frank Urio',
    sub: '+255 744 108 377 · member since 2024',
    level: 'Social',
    record: '3–7',
    moved: -2,
    lastPlayed: '3 days ago',
    availability: 'EVENINGS ONLY',
    action: 'Challenge',
  },
  {
    initials: 'KS',
    name: 'Kelvin Shirima',
    sub: '+255 786 330 512 · club no. 1',
    level: 'Open',
    record: '21–5',
    moved: null,
    lastPlayed: 'Today',
    availability: 'AWAY · DAR OPEN',
    action: 'Profile',
  },
  {
    initials: 'SM',
    name: 'Sofia Mushi',
    sub: '14 yrs · guardian +255 755 601 233',
    level: 'Green ball',
    record: '6–2',
    moved: 2,
    lastPlayed: 'Yesterday',
    availability: 'JUNIOR SQUAD',
    action: 'Profile',
  },
  {
    initials: 'BM',
    name: 'Baraka Meena',
    sub: '+255 782 774 016 · member since 2025',
    level: 'Social',
    record: '1–3',
    moved: -1,
    lastPlayed: '12 days ago',
    availability: 'MEMBERSHIP DUE',
    action: 'Remind',
  },
];

/** How the 68 members spread across the six levels. */
export const LEVEL_COUNTS: Record<Level, number> = {
  'Red ball': 11,
  'Green ball': 13,
  Social: 16,
  Club: 18,
  Competitive: 8,
  Open: 2,
};

export const MEMBER_COUNT = LEVELS.reduce((sum, level) => sum + LEVEL_COUNTS[level], 0);

/** The roster's filter tabs, with the counts the design shows. */
export const ROSTER_FILTERS = [
  { label: 'All', count: MEMBER_COUNT },
  { label: 'Adults', count: 44 },
  { label: 'Juniors', count: 24 },
  { label: 'Open to a game', count: 19 },
  { label: 'Membership due', count: 6 },
] as const;

/** Players who have marked themselves free for a hit in the next seven days. */
export const FREE_THIS_WEEK = {
  /** Spelled out, because the rail reads as a sentence rather than a stat. */
  headline: 'Nine players want a hit',
  faces: ['JK', 'AM', 'NL', 'EM'],
  more: 5,
};

/** Level changes this month, for the rail. */
export const PROMOTIONS: { initials: string; name: string; from: Level; to: Level }[] = [
  { initials: 'AM', name: 'Asha Mollel', from: 'Club', to: 'Competitive' },
  { initials: 'SM', name: 'Sofia Mushi', from: 'Red ball', to: 'Green ball' },
  { initials: 'EM', name: 'Editha Mrema', from: 'Social', to: 'Club' },
];

export const MEMBERSHIPS_DUE = { count: 6, amount: 'TSh 540,000' };
