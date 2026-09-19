/**
 * The club's vocabulary for a person.
 *
 * Six levels, two roles, five ways of being available. These are the strings
 * the `players` table stores and the strings the roster screen renders, and
 * they live here — with no imports — so that the database schema, a Server
 * Component and a Client Component can all agree on them without any of the
 * three pulling in the other two's dependencies.
 *
 * `src/components/admin/ui.tsx` re-exports `LEVELS` and `Level`, because the
 * office's small parts have always been where a screen reaches for them.
 */

/**
 * The ladder, palest to darkest. The order is meaningful: the array index is
 * the rung, which is what makes "moved up a level" a comparison rather than a
 * lookup table.
 */
export const LEVELS = ['Red ball', 'Green ball', 'Social', 'Club', 'Competitive', 'Open'] as const;
export type Level = (typeof LEVELS)[number];

/**
 * A level is nullable everywhere. The club sets one after a hitting
 * assessment, so a member who has just joined genuinely has no level, and
 * inventing one for them would put them on a rung nobody has seen them play.
 */
export type MaybeLevel = Level | null;

export function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

/** Which rung. Higher is stronger. */
export function levelRank(level: Level): number {
  return LEVELS.indexOf(level);
}

/** A coach is staff. They are on the roster, but not on the ladder. */
export const PLAYER_ROLES = ['member', 'coach'] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

export function isRole(value: unknown): value is PlayerRole {
  return typeof value === 'string' && (PLAYER_ROLES as readonly string[]).includes(value);
}

/**
 * What the player has told the club about when they will play. This is the
 * one thing on the roster the pairing tool reads, which is why it is a stored
 * choice rather than something inferred from their bookings.
 */
export const AVAILABILITIES = ['open', 'weekends', 'evenings', 'away', 'none'] as const;
export type PlayerAvailability = (typeof AVAILABILITIES)[number];

export function isAvailability(value: unknown): value is PlayerAvailability {
  return typeof value === 'string' && (AVAILABILITIES as readonly string[]).includes(value);
}

/** How the choice reads in the roster's badge column. */
export const AVAILABILITY_BADGE: Record<PlayerAvailability, string> = {
  open: 'OPEN TO A GAME',
  weekends: 'WEEKENDS ONLY',
  evenings: 'EVENINGS ONLY',
  away: 'AWAY',
  none: 'NOT PLAYING',
};

/** How the choice reads on a form, where it is a sentence rather than a state. */
export const AVAILABILITY_LABEL: Record<PlayerAvailability, string> = {
  open: 'Open to a game',
  weekends: 'Weekends only',
  evenings: 'Evenings only',
  away: 'Away',
  none: 'Not playing',
};

/** Under this, a player is in the junior squad and a guardian is on file. */
export const JUNIOR_AGE = 18;

/**
 * Age from a birth year alone, which is all the club records.
 *
 * It is therefore the age they turn this year, not the age they are today —
 * out by up to a year and never more, which is enough to sort a junior from
 * an adult and is not offered for anything finer.
 */
export function ageIn(birthYear: number, isoDate: string): number {
  return Number(isoDate.slice(0, 4)) - birthYear;
}

export function isJunior(birthYear: number | null, isoDate: string): boolean {
  return birthYear !== null && ageIn(birthYear, isoDate) < JUNIOR_AGE;
}

/**
 * Initials for an avatar. Two letters from a full name, one from a mononym —
 * padding "Deo" out to "DE" would look like a surname the club does not have.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Tanzanian mobile numbers, normalised to +255.
 *
 * The same rule the booking routes apply — see src/app/api/bookings/route.ts.
 * Returns null when the number is not one, and '' for "no number on file",
 * which is a legitimate state: the desk signs people up off a paper list.
 */
export function normalisePhone(raw: string): string | null {
  const stripped = raw.replace(/[\s-]/g, '');
  if (!stripped) return '';
  if (!/^(\+?255|0)[67]\d{8}$/.test(stripped)) return null;
  return stripped.replace(/^(\+?255|0)/, '+255');
}
