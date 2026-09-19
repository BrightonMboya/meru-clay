/**
 * Challenges and matches.
 *
 * ⚠️ DEMO DATA, as everywhere in the club office until Supabase lands — see
 * the note at the top of src/lib/bookings.ts. The shapes below are what the
 * screens need; the arrays are the sample fixtures drawn in the Paper file.
 *
 * A challenge holds the court for both players. If it is not accepted inside
 * two hours the slot goes back on sale, which is why "awaiting a reply" is the
 * one clay-coloured number on the screen.
 */

import type { Reading } from '@/components/admin/ui';

/** What kind of match this is, which is also how the badge reads. */
export type MatchKind = 'LADDER' | 'FRIENDLY' | 'PRACTICE SET' | 'JUNIOR MATCH' | 'DOUBLES';

export type MatchState = 'CONFIRMED' | 'AWAITING REPLY' | 'PLAYED';

export type Fixture = {
  /** "Tue 16 · 17:00" — the design spells the day out rather than sorting on it. */
  when: string;
  /** "1.5 hr · Court 2", plus " · lights" after dusk. */
  court: string;
  players: { initials: string; name: string }[];
  kind: MatchKind;
  /** Who is paying for the court. */
  money: string;
  state: MatchState;
};

export const MATCH_READINGS: Reading[] = [
  { label: 'Played in September', value: '34', detail: '23 ladder · 11 friendly' },
  { label: 'Awaiting a reply', value: '5', detail: 'one expires in 41 min', accent: true },
  { label: 'Scores to confirm', value: '3', detail: 'blocking the ladder' },
  { label: 'Accepted within 2 hr', value: '78%', detail: 'up from 64% in August' },
];

export const FIXTURES: Fixture[] = [
  {
    when: 'Tue 16 · 17:00',
    court: '1.5 hr · Court 2',
    players: [
      { initials: 'AM', name: 'Asha Mollel' },
      { initials: 'JK', name: 'Juma Kimaro' },
    ],
    kind: 'LADDER',
    money: 'Court paid · split',
    state: 'AWAITING REPLY',
  },
  {
    when: 'Wed 17 · 18:00',
    court: '1.5 hr · Court 1 · lights',
    players: [
      { initials: 'NL', name: 'Neema Laizer' },
      { initials: 'DM', name: 'Daniel Massawe' },
    ],
    kind: 'FRIENDLY',
    money: 'Court paid · Neema',
    state: 'CONFIRMED',
  },
  {
    when: 'Thu 18 · 06:30',
    court: '1 hr · Court 2',
    players: [
      { initials: 'KS', name: 'Kelvin Shirima' },
      { initials: 'FU', name: 'Frank Urio' },
    ],
    kind: 'PRACTICE SET',
    money: 'Coach watching',
    state: 'CONFIRMED',
  },
  {
    when: 'Sat 20 · 08:00',
    court: '1.5 hr · Court 1',
    players: [
      { initials: 'NL', name: 'Neema Laizer' },
      { initials: 'EM', name: 'Editha Mrema' },
    ],
    kind: 'LADDER',
    money: 'Pay at court',
    state: 'AWAITING REPLY',
  },
  {
    when: 'Sun 21 · 16:00',
    court: '1.5 hr · Court 1',
    players: [
      { initials: 'SM', name: 'Sofia Mushi' },
      { initials: 'BM', name: 'Baraka Meena' },
    ],
    kind: 'JUNIOR MATCH',
    money: 'Club pays · academy',
    state: 'CONFIRMED',
  },
];

/* ------------------------------------------- the challenge builder's state */

/** An opponent the builder offers. Only one level up or down is allowed. */
export const OPPONENTS = [
  {
    initials: 'JK',
    name: 'Juma Kimaro',
    note: 'Competitive · 14–3 · won your last meeting',
    chosen: true,
  },
  { initials: 'NL', name: 'Neema Laizer', note: 'Club · 9–6 · one level below you', chosen: false },
  { initials: 'DM', name: 'Daniel Massawe', note: 'Club · 4–5 · weekends only', chosen: false },
];

/** Days both diaries are free. */
export const CHALLENGE_DAYS = [
  { weekday: 'TUE', day: 16, chosen: false },
  { weekday: 'WED', day: 17, chosen: true },
  { weekday: 'THU', day: 18, chosen: false },
  { weekday: 'FRI', day: 19, chosen: false },
  { weekday: 'SAT', day: 20, chosen: false },
];

/** Slots free on both diaries. `floodlit` earns the little grey square. */
export const CHALLENGE_SLOTS = [
  { label: '06:30 · Ct 2', state: 'free' },
  { label: '10:00 · Ct 1', state: 'free' },
  { label: '15:00 · Ct 2', state: 'free' },
  { label: '18:00 · Ct 1', state: 'chosen', floodlit: true },
  { label: '19:30 · Ct 1', state: 'free' },
  { label: '20:30 · held', state: 'held' },
] as const;

export const HEAD_TO_HEAD = {
  record: '1 – 2',
  headline: 'Juma won the last one 6–4 7–5',
  detail: '24 Aug · Court 1 · 1 hr 48 min',
  /** Most recent last, the way a form guide reads. */
  form: ['L 4–6 5–7', 'W 6–3 6–4', 'L 2–6 4–6'],
};

export const CHALLENGE_TOTAL = {
  price: 'TSh 15,000',
  split: 'split two ways · 7,500 each',
  detail: 'Wed 17 Sept · 18:00–19:30 · Court 1 under lights · best of three',
};

/* ---------------------------------------------------------------- the rail */

export const URGENT_CHALLENGE = {
  expiresIn: '41 MIN',
  kind: 'LADDER',
  pairing: 'Asha Mollel → Juma Kimaro',
  detail: 'Tue 16 Sept · 17:00 · Court 2',
};

export const WAITING = [
  { age: '2h', pairing: 'Frank Urio → Baraka Meena', detail: 'Thu 18 · 17:00 · friendly' },
  { age: '5h', pairing: 'Neema Laizer → Editha Mrema', detail: 'Sat 20 · 08:00 · ladder' },
  { age: '1d', pairing: 'Doubles · four players', detail: 'Sun 21 · 16:00 · two replies in' },
];

export const SCORE_TO_CONFIRM = {
  /** Winner first — the entering player is the one claiming the result. */
  rows: [
    { name: 'Kelvin Shirima', sets: [6, 6], won: true },
    { name: 'Juma Kimaro', sets: [4, 3], won: false },
  ],
  note: 'Entered by Kelvin on Sunday. Confirming moves both players on the ladder.',
};
