/**
 * Tournaments — what the club hosts on its own clay, and where it travels to.
 *
 * ⚠️ DEMO DATA. See the note at the top of src/lib/bookings.ts.
 *
 * A hosted tournament blocks both courts for its whole run, which is why the
 * schedule list says so out loud: when this is wired up, creating one writes
 * closures that `src/lib/availability.ts` already knows how to subtract.
 */

/** One side of a tie. */
export type Side = {
  /** Seeding, or "—" for an unseeded player and a slot not yet filled. */
  seed: string;
  name: string;
  /** Games won per set, most matches being best of three. */
  sets?: number[];
  /** Replaces the score before the tie is played: a time, or a court. */
  note?: string;
  won?: boolean;
};

/** A tie is two sides. `pending` draws it dashed — nobody is in it yet. */
export type Tie = { sides: [Side, Side]; pending?: boolean };

export const FEATURED = {
  state: 'ENTRIES OPEN',
  closes: 'CLOSES FRI 3 OCT',
  name: 'The Meru Clay Open',
  when: '10–12 October · our own clay',
  blurb:
    "Three days, four draws. Men's and women's singles plus a Saturday-evening mixed doubles under the lights. Umpired finals on Court 1.",
  entries: { in: 23, places: 32 },
  facts: [
    { label: 'Entry fee', value: 'TSh 20,000 · members 15,000' },
    { label: 'Draws', value: 'MS · WS · MXD · U14' },
    { label: 'Courts blocked', value: 'Both · 07:00–21:00' },
    { label: 'Prize', value: 'TSh 600,000 pool' },
  ],
};

export const DRAWS = ["Men's", "Women's", 'Mixed doubles', 'U14'] as const;

export const QUARTER_FINALS: Tie[] = [
  {
    sides: [
      { seed: '1', name: 'Kelvin Shirima', sets: [6, 6], won: true },
      { seed: '—', name: 'Baraka Meena', sets: [2, 1] },
    ],
  },
  {
    sides: [
      { seed: '4', name: 'Daniel Massawe', sets: [7, 6], won: true },
      { seed: '—', name: 'Godfrey Nnko', sets: [5, 4] },
    ],
  },
  {
    sides: [
      { seed: '3', name: 'Frank Urio', sets: [6, 6], won: true },
      { seed: '—', name: 'Isaya Sanga', sets: [3, 2] },
    ],
  },
  {
    sides: [
      { seed: '2', name: 'Juma Kimaro', sets: [6, 6], won: true },
      { seed: '—', name: 'Amani Mtui', sets: [4, 2] },
    ],
  },
];

export const SEMI_FINALS: Tie[] = [
  {
    sides: [
      { seed: '1', name: 'Kelvin Shirima', note: '16:00', won: true },
      { seed: '4', name: 'Daniel Massawe', note: 'Ct 1', won: true },
    ],
  },
  {
    sides: [
      { seed: '3', name: 'Frank Urio', note: '18:00', won: true },
      { seed: '2', name: 'Juma Kimaro', note: 'Ct 1', won: true },
    ],
  },
];

export const FINAL: Tie = {
  pending: true,
  sides: [
    { seed: '—', name: 'Winner of SF 1' },
    { seed: '—', name: 'Winner of SF 2' },
  ],
};

export const CHAMPION = {
  name: 'Kelvin Shirima',
  blurb: 'Won 2025 in three sets on Court 1. Unbeaten on clay at home since March.',
};

/* ------------------------------------------------------------- the two lists */

export type Hosted = {
  month: string;
  day: string;
  name: string;
  detail: string;
  state: 'OPEN' | 'PLANNING' | 'DRAFT';
  action: 'Manage' | 'Edit';
};

export const HOSTED: Hosted[] = [
  {
    month: 'OCT',
    day: '10',
    name: 'The Meru Clay Open',
    detail: 'Three days · 4 draws · 23 of 32 entered',
    state: 'OPEN',
    action: 'Manage',
  },
  {
    month: 'NOV',
    day: '08',
    name: 'Junior Clay Festival',
    detail: 'Red & green ball · all morning · 24 kids',
    state: 'PLANNING',
    action: 'Manage',
  },
  {
    month: 'NOV',
    day: '29',
    name: 'Ngaramtoni Doubles Night',
    detail: 'Mixed doubles · under lights · 16 pairs',
    state: 'DRAFT',
    action: 'Edit',
  },
  {
    month: 'DEC',
    day: '20',
    name: "Members' Christmas Round-Robin",
    detail: 'Everyone plays four short sets · free',
    state: 'DRAFT',
    action: 'Edit',
  },
];

export type AwayTrip = {
  month: string;
  day: string;
  name: string;
  detail: string;
  faces: string[];
  going: string;
  action: 'Travel' | 'Plan';
};

export const AWAY: AwayTrip[] = [
  {
    month: 'SEP',
    day: '26',
    name: 'Dar es Salaam Open',
    detail: 'Gymkhana · hard court · 620 km',
    faces: ['KS', 'AM'],
    going: '2 going',
    action: 'Travel',
  },
  {
    month: 'OCT',
    day: '24',
    name: 'Kilimanjaro Cup, Moshi',
    detail: 'TCC · hard court · 90 km',
    faces: ['JK', 'NL'],
    going: '4 going',
    action: 'Travel',
  },
  {
    month: 'NOV',
    day: '15',
    name: 'East Africa Juniors, Nairobi',
    detail: 'Karen Club · U14 & U16 · visas needed',
    faces: ['SM', '+2'],
    going: '3 going',
    action: 'Plan',
  },
  {
    month: 'JAN',
    day: '17',
    name: 'Zanzibar Beach Invitational',
    detail: 'Clay · doubles only · club pays half',
    faces: ['?', '?'],
    going: '0 going',
    action: 'Plan',
  },
];
