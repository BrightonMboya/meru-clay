/**
 * The client-side cache contract.
 *
 * Query keys and their fetchers live together so every caller — the booking
 * widget, the desk, anything added later — agrees on what a cache entry is
 * called. Invalidation then has something stable to aim at.
 *
 * This module is imported by Client Components, so it must stay free of
 * server-only imports. It fetches the Route Handlers over relative URLs.
 */

import { queryOptions } from '@tanstack/react-query';
import type { Slot } from '@/lib/availability';
import { getJson } from './http';

export type AvailabilityQuery = { date: string; duration: number; coach: boolean };

export type AvailabilityPayload = {
  date: string;
  duration: number;
  coach: boolean;
  slots: Slot[];
};

export const availability = {
  key: ({ date, duration, coach }: AvailabilityQuery) =>
    ['availability', date, duration, coach] as const,

  options: (q: AvailabilityQuery) =>
    queryOptions({
      queryKey: availability.key(q),
      queryFn: ({ signal }) =>
        getJson<AvailabilityPayload>(
          `/api/availability?date=${q.date}&duration=${q.duration}${q.coach ? '&coach=1' : ''}`,
          { signal },
        ),
      enabled: Boolean(q.date),
      // Somebody else can take a slot at any moment. Thirty seconds is short
      // enough that the grid is rarely lying and long enough not to hammer
      // the pooler while a player fills in their name.
      refetchInterval: 30_000,
    }),
};

export type CreateBookingInput = {
  court: number;
  date: string;
  start: number;
  duration: number;
  coach: boolean;
  name: string;
  phone: string;
  email?: string;
};

export type CreatedBooking = {
  id: string;
  reference: string;
  court: number;
  courtName: string;
  date: string;
  when: string;
  coach: boolean;
  status: string;
};

export function createBooking(input: CreateBookingInput) {
  return getJson<CreatedBooking>('/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** A rejected slot claim hands back what is still free, so the grid can refresh. */
export function slotsFromError(err: unknown): Slot[] | null {
  const body = (err as { body?: { slots?: Slot[] } } | undefined)?.body;
  return body?.slots ?? null;
}

/** Re-exported: callers here have always asked this module for it. */
export { statusOf } from './http';

// ── The court desk ──────────────────────────────────────────────────────────

export type DeskEntryAction = 'confirm' | 'cancel' | 'paid' | 'unpaid';

export const desk = {
  key: (date: string) => ['desk', date] as const,

  options: <T>(date: string) =>
    queryOptions({
      queryKey: desk.key(date),
      queryFn: ({ signal }) => getJson<T>(`/api/desk?date=${date}`, { signal }),
      // The desk is a live board. A minute is fine: holds run for ten.
      refetchInterval: 60_000,
    }),
};

export function actOnBooking(id: string, action: DeskEntryAction) {
  return getJson<{ ok: true }>(`/api/desk/bookings/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

export type DeskBookingInput = {
  court: number;
  date: string;
  start: number;
  duration: number;
  name: string;
  phone?: string;
  coach?: boolean;
  paid?: boolean;
  notes?: string;
};

/** A booking taken at the counter: confirmed on the spot, no hold. */
export function createDeskBooking(input: DeskBookingInput) {
  return getJson<CreatedBooking>('/api/desk/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export type CloseCourtInput = {
  /** null closes every court. */
  court: number | null;
  date: string;
  start: number;
  end: number;
  reason?: string;
};

export function closeCourt(input: CloseCourtInput) {
  return getJson<{ id: number }>('/api/desk/blocks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function reopenCourt(id: number) {
  return getJson<{ ok: true }>(`/api/desk/blocks/${id}`, { method: 'DELETE' });
}

// ── A player's own booking ──────────────────────────────────────────────────

export type BookingView = {
  id: string;
  reference: string;
  court: number;
  courtName: string;
  date: string;
  day: string;
  when: string;
  start: number;
  end: number;
  coach: boolean;
  status: 'held' | 'confirmed' | 'cancelled';
  paid: boolean;
  amount: number;
  /** Epoch ms the hold dies; null once confirmed or cancelled. */
  expiresAt: number | null;
};

export const myBooking = {
  key: (id: string) => ['booking', id] as const,

  options: (id: string) =>
    queryOptions({
      queryKey: myBooking.key(id),
      queryFn: ({ signal }) => getJson<BookingView>(`/api/bookings/${id}`, { signal }),
      // A hold can be confirmed by the coach at any moment, and lapses on its
      // own. Half a minute keeps the page honest without polling hard.
      refetchInterval: 30_000,
    }),
};

export function cancelMyBooking(id: string) {
  return getJson<{ ok: true }>(`/api/bookings/${id}`, { method: 'DELETE' });
}
