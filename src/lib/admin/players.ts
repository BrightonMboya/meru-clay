/**
 * The club roster, as the screen reads it.
 *
 * Everything here is pure. It takes the rows `src/lib/players.ts` fetched and
 * arranges them into the shape the Paper design draws — the level bar, the
 * filter counts, the money outstanding, the two rail panels — and it does it
 * without touching the database, which is what lets the Client Component
 * re-filter and re-search the same payload without going back to the server.
 *
 * The rule the whole file follows: a number on this screen is counted, never
 * stored. `MEMBER_COUNT` was a constant and is now `members`; `LEVEL_COUNTS`
 * was a hand-written record and is now a tally. Nothing on the roster can
 * disagree with the rows underneath it, because there is nothing left to
 * disagree with them.
 */

import { MEMBERSHIP_TIERS, fmtTsh, lapses, type MembershipTier } from '@/lib/pricing';
import type { PlayerRow } from '@/lib/players';
import {
  AVAILABILITY_BADGE,
  LEVELS,
  initialsOf,
  isJunior,
  levelRank,
  type Level,
  type MaybeLevel,
  type PlayerAvailability,
} from '@/lib/roster';

/** The badge in the availability column: a derived state, not a stored one. */
export type Availability =
  | 'OPEN TO A GAME'
  | 'WEEKENDS ONLY'
  | 'EVENINGS ONLY'
  | 'AWAY'
  | 'NOT PLAYING'
  | 'JUNIOR SQUAD'
  | 'MEMBERSHIP DUE'
  | 'COACH';

/** One row of the roster table. */
export type Player = {
  id: number;
  initials: string;
  name: string;
  /** Phone and joining year, or a junior's age and guardian. */
  sub: string;
  phone: string;
  /** Receipts only, and often absent. The profile dialog edits it. */
  email: string | null;
  level: MaybeLevel;
  /** Ladder record, wins–losses. '—' for somebody who has not played one. */
  record: string;
  /** "2 days ago", or 'Not yet' — derived from bookings and class places. */
  lastPlayed: string;
  /** The badge. A derived state, which may outrank what is stored. */
  availability: Availability;
  /**
   * What is actually stored. The badge hides it for a junior, an overdue
   * member and a coach, and the profile panel still has to edit it.
   */
  availabilityChoice: PlayerAvailability;
  membership: MembershipTier;
  /** Paid up to and including this date; null for never. */
  paidUntil: string | null;
  /** The one thing this row offers to do. */
  action: 'Remind' | 'Profile';
  junior: boolean;
  coach: boolean;
  /** Membership has lapsed, or was never paid. */
  due: boolean;
  /** No number on file, so nothing can be sent to them and nothing joined. */
  unreachable: boolean;
};

export const ROSTER_FILTERS = [
  'all',
  'adults',
  'juniors',
  'open',
  'unranked',
  'due',
  'coaches',
] as const;
export type RosterFilter = (typeof ROSTER_FILTERS)[number];

export const FILTER_LABELS: Record<RosterFilter, string> = {
  // Reads as the default state of a dropdown, where a bare "All" would not.
  all: 'All players',
  adults: 'Adults',
  juniors: 'Juniors',
  open: 'Open to a game',
  unranked: 'Unranked',
  due: 'Membership due',
  coaches: 'Coaches',
};

/** Everything the roster screen renders, from one payload. */
export type Roster = {
  /** Today at the club, so the client agrees with the server about "now". */
  today: string;
  players: Player[];
  /** Members only — a coach is staff, not a subscription. */
  members: number;
  coaches: number;
  joinedThisMonth: number;
  /** How the members spread across the six levels. Coaches are not on it. */
  levelCounts: Record<Level, number>;
  unranked: number;
  filters: { key: RosterFilter; label: string; count: number }[];
  due: { count: number; amount: string };
  freeThisWeek: {
    count: number;
    headline: string;
    /** Initials for the avatar stack, and the names behind them. */
    faces: { initials: string; name: string }[];
    more: number;
  };
  promotions: { id: number; initials: string; name: string; from: Level; to: Level }[];
};

export type RosterInput = {
  today: string;
  rows: PlayerRow[];
  /** `phone -> YYYY-MM-DD`, from `lastPlayedByPhone`. */
  lastPlayed: Record<string, string>;
  /** `playerId -> YYYY-MM-DD`, from `lastAttendedByPlayer`. */
  attended: Record<number, string>;
  /** Numbers with a court already booked in the next seven days. */
  bookedThisWeek: Set<string>;
};

export function buildRoster({
  today,
  rows,
  lastPlayed,
  attended,
  bookedThisWeek,
}: RosterInput): Roster {
  /**
   * Two sources for one fact, and the later of them wins. A booking knows a
   * phone number; the desk marking somebody present knows a player. Most of
   * the club has both, some of it has only the second, and taking the max
   * means neither can make the other look staler than it is.
   */
  const players = rows.map((row) =>
    toPlayer(row, today, latest(lastPlayed[row.phone], attended[row.id])),
  );

  const members = rows.filter((r) => r.role === 'member');
  const levelCounts = Object.fromEntries(LEVELS.map((l) => [l, 0])) as Record<Level, number>;
  for (const row of members) if (row.level) levelCounts[row.level] += 1;

  const dueRows = members.filter((r) => isDue(r, today));

  return {
    today,
    players,
    members: members.length,
    coaches: rows.length - members.length,
    joinedThisMonth: members.filter((r) => r.joinedOn.slice(0, 7) === today.slice(0, 7)).length,
    levelCounts,
    unranked: members.filter((r) => r.level === null).length,
    filters: ROSTER_FILTERS.map((key) => ({
      key,
      label: FILTER_LABELS[key],
      count: players.filter((p) => matchesFilter(p, key)).length,
    })),
    due: {
      count: dueRows.length,
      amount: `TSh ${fmtTsh(dueRows.reduce((sum, r) => sum + MEMBERSHIP_TIERS[r.membership].fee, 0))}`,
    },
    freeThisWeek: freeToPlay(players, bookedThisWeek),
    promotions: promotions(rows, today),
  };
}

/**
 * Does this row belong under that chip?
 *
 * Exported because the Client Component filters the same payload the server
 * counted — one definition, so a chip can never say 6 and then show 5.
 */
export function matchesFilter(player: Player, filter: RosterFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'adults':
      return !player.junior && !player.coach;
    case 'juniors':
      return player.junior;
    case 'open':
      /**
       * The stored answer, not the badge. MEMBERSHIP DUE outranks OPEN TO A
       * GAME in the column — money is what the desk needs to see — but
       * somebody who owes the club ninety thousand shillings is still
       * willing to play, and leaving them out of the pairing list would lose
       * the club a court booking as well as the subscription.
       */
      return player.availabilityChoice === 'open';
    case 'unranked':
      return player.level === null && !player.coach;
    case 'due':
      return player.due;
    case 'coaches':
      return player.coach;
  }
}

/**
 * Name or number, case- and space-insensitive.
 *
 * Numbers are stored E.164 (+255…) and typed at the desk the local way
 * (07…), so a search is tried against both spellings of the same number.
 * Without that, typing the number off somebody's own phone finds nobody.
 */
export function matchesSearch(player: Player, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/[\s-]/g, '');
  if (!q) return true;
  if (player.name.toLowerCase().includes(q)) return true;
  if (!player.phone) return false;

  const local = player.phone.replace(/^\+255/, '0');
  return player.phone.includes(q) || local.includes(q);
}

/* ------------------------------------------------------------- one player */

/** The later of two ISO dates, either of which may be missing. */
function latest(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function toPlayer(row: PlayerRow, today: string, playedOn: string | undefined): Player {
  const junior = isJunior(row.birthYear, today);
  const coach = row.role === 'coach';
  const due = isDue(row, today);
  const played = row.wins + row.losses > 0;

  return {
    id: row.id,
    initials: initialsOf(row.name),
    name: row.name,
    sub: subLine(row, today, junior, coach),
    phone: row.phone,
    email: row.email,
    level: row.level,
    record: played ? `${row.wins}–${row.losses}` : '—',
    lastPlayed: row.phone || playedOn ? sincePlayed(playedOn, today) : 'No number',
    availability: badgeFor(row, junior, coach, due),
    availabilityChoice: row.availability,
    membership: row.membership,
    paidUntil: row.paidUntil,
    action: due ? 'Remind' : 'Profile',
    junior,
    coach,
    due,
    unreachable: row.phone === '',
  };
}

/**
 * The quiet second line. A junior's guardian displaces their own number,
 * because that is who the club rings.
 */
function subLine(row: PlayerRow, today: string, junior: boolean, coach: boolean): string {
  if (junior) {
    const age = Number(today.slice(0, 4)) - (row.birthYear ?? 0);
    const guardian = row.guardianPhone
      ? `guardian ${row.guardianPhone}`
      : 'no guardian number on file';
    return `${age} yrs · ${guardian}`;
  }

  const who = coach ? 'coach' : `member since ${row.joinedOn.slice(0, 4)}`;
  return `${row.phone || 'no number on file'} · ${who}`;
}

/**
 * Which single state to show. The order is the club's priority, not the
 * data's: money first, then the squad somebody trains with, then what they
 * told us about their own week.
 */
function badgeFor(
  row: PlayerRow,
  junior: boolean,
  coach: boolean,
  due: boolean,
): Availability {
  if (coach) return 'COACH';
  if (due) return 'MEMBERSHIP DUE';
  if (junior) return 'JUNIOR SQUAD';
  return AVAILABILITY_BADGE[row.availability] as Availability;
}

/** A coach pays nothing, and pay-as-you-play has no term to fall out of. */
function isDue(row: PlayerRow, today: string): boolean {
  if (row.role !== 'member' || !lapses(row.membership)) return false;
  return row.paidUntil === null || row.paidUntil < today;
}

/**
 * "2 days ago".
 *
 * Deliberately vague past a fortnight: the desk only ever reads this column
 * to sort "recently" from "not for a while", and a precise date would invite
 * arithmetic nobody wants to do down a list of forty.
 */
function sincePlayed(playedOn: string | undefined, today: string): string {
  if (!playedOn) return 'Not yet';

  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${playedOn}T00:00:00Z`)) / 86_400_000,
  );
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/* ----------------------------------------------------------- the two rails */

const SPELLED = [
  'Nobody', 'One', 'Two', 'Three', 'Four', 'Five',
  'Six', 'Seven', 'Eight', 'Nine', 'Ten',
];

/**
 * Who wants a game and has not got one.
 *
 * Two conditions, and the second is the one that earns the panel its place.
 * "Open to a game" is a standing preference with no date on it, so on its own
 * it would list the same faces every week including everybody who is already
 * booked in on Thursday. Subtracting the week's diary turns it into a list of
 * people the desk can actually do something about.
 *
 * A player with no number on file cannot be matched to a booking, so they are
 * counted as free — the same assumption `lastPlayed` makes, and the same one
 * the roster flags in their row.
 *
 * Coaches are left out. They may well be up for a hit, and the "Open to a
 * game" chip still counts them; this panel is about pairing two members.
 *
 * The rail reads as a sentence, so small counts are spelled out — "Nine
 * players want a hit", not "9".
 */
function freeToPlay(players: Player[], bookedThisWeek: Set<string>): Roster['freeThisWeek'] {
  const free = players.filter(
    (p) => !p.coach && p.availabilityChoice === 'open' && !bookedThisWeek.has(p.phone),
  );
  const count = free.length;
  const word = count < SPELLED.length ? SPELLED[count] : String(count);

  return {
    count,
    headline:
      count === 0
        ? 'Nobody to pair this week'
        : `${word} player${count === 1 ? '' : 's'} want${count === 1 ? 's' : ''} a hit`,
    faces: free.slice(0, 4).map((p) => ({ initials: p.initials, name: p.name })),
    more: Math.max(0, count - 4),
  };
}

/**
 * Level changes this month, newest first.
 *
 * Only upward moves. A player dropping a rung is a real thing the ladder
 * does, but this rail is the one place on the screen that is celebration
 * rather than administration, and the club does not post demotions.
 */
function promotions(rows: PlayerRow[], today: string): Roster['promotions'] {
  return rows
    .filter(
      (r) =>
        r.level !== null &&
        r.previousLevel !== null &&
        r.levelSetAt?.slice(0, 7) === today.slice(0, 7) &&
        levelRank(r.level) > levelRank(r.previousLevel),
    )
    .sort((a, b) => (b.levelSetAt ?? '').localeCompare(a.levelSetAt ?? ''))
    .map((r) => ({
      id: r.id,
      initials: initialsOf(r.name),
      name: r.name,
      from: r.previousLevel as Level,
      to: r.level as Level,
    }));
}
