/**
 * The roster's client-side cache contract.
 *
 * The same arrangement as src/lib/queries/bookings.ts: one key, one fetcher,
 * and a function per write, so the screen never builds a URL itself and
 * invalidation has a stable thing to aim at.
 *
 * Imported by Client Components, so nothing server-only may appear here. The
 * types it names are the plain payload shapes the Route Handlers return.
 */

import { queryOptions } from '@tanstack/react-query';
import type { Roster } from '@/lib/admin/players';
import type { MaybeLevel, PlayerAvailability } from '@/lib/roster';
import type { MembershipTier } from '@/lib/pricing';
import { getJson } from './http';

export const roster = {
  key: () => ['roster'] as const,

  options: () =>
    queryOptions({
      queryKey: roster.key(),
      queryFn: ({ signal }) => getJson<Roster>('/api/desk/players', { signal }),
      /**
       * No polling, and a minute of trust in what the server rendered.
       *
       * The roster is not a live board — a member's level does not change
       * while you are looking at it, the way a hold expires — so the default
       * `staleTime: 0` would only buy a duplicate of the payload the page
       * already arrived holding. Every write invalidates this key by hand, so
       * nothing the operator does waits out the minute.
       */
      staleTime: 60_000,
    }),
};

export type NewMember = {
  name: string;
  phone: string;
  email?: string;
  role?: 'member' | 'coach';
  level?: MaybeLevel;
  age?: number | null;
  guardianName?: string;
  guardianPhone?: string;
  membership?: MembershipTier;
  availability?: PlayerAvailability;
  /** Their first payment was taken at the desk, so the term starts today. */
  paidNow?: boolean;
  joinedOn?: string;
};

export type SavedPlayer = { id: number; name: string };

export function addPlayer(input: NewMember) {
  return getJson<SavedPlayer>('/api/desk/players', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/**
 * Everything the roster's profile panel can change.
 *
 * `level` is deliberately allowed to be `null` — un-assessing somebody is a
 * real correction — so callers must send the key to mean it, and omit the key
 * to leave the level alone.
 */
export type PlayerEdit = {
  name?: string;
  phone?: string;
  email?: string | null;
  level?: MaybeLevel;
  membership?: MembershipTier;
  availability?: PlayerAvailability;
  /** Take a membership payment: advances their paid-up date by one term. */
  markPaid?: boolean;
};

export function editPlayer(id: number, patch: PlayerEdit) {
  return getJson<SavedPlayer>(`/api/desk/players/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function removePlayer(id: number) {
  return getJson<{ ok: true }>(`/api/desk/players/${id}`, { method: 'DELETE' });
}

/** What the desk wrote, and the few days already on file for that player. */
export type Attendance = {
  date: string;
  recent: string[];
  /** False when the day was already recorded, which is not a refusal. */
  written: boolean;
};

export function recordAttendance(input: { playerId: number; date: string }) {
  return getJson<Attendance>('/api/desk/attendance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}
