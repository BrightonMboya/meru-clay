/**
 * The lead pipeline's client-side cache contract.
 *
 * The same arrangement as src/lib/queries/players.ts: one key per thing, one
 * fetcher, and a function per write, so the screen never builds a URL itself.
 *
 * Imported by Client Components, so nothing server-only may appear here. The
 * types it names are the plain payload shapes the Route Handlers return —
 * which, for both queries below, is what src/lib/admin/load.ts already built.
 */

import { queryOptions } from '@tanstack/react-query';
import type { Board, LeadThread } from '@/lib/admin/load';
import type { LeadSource, LeadStage, Period } from '@/lib/pipeline';
import { getJson } from './http';

export type { Board };

/**
 * What the screen is looking at. Part of the cache key, because a board
 * filtered to one campaign and the whole board are different answers and
 * must not overwrite each other.
 */
export type BoardFilters = { campaign: string | null; days: Period };

function boardUrl({ campaign, days }: BoardFilters): string {
  const q = new URLSearchParams({ days: String(days) });
  if (campaign) q.set('campaign', campaign);
  return `/api/desk/leads?${q}`;
}

export const board = {
  key: (filters?: BoardFilters) =>
    filters ? (['leads', filters.campaign, filters.days] as const) : (['leads'] as const),

  options: (filters: BoardFilters) =>
    queryOptions({
      queryKey: board.key(filters),
      queryFn: ({ signal }) => getJson<Board>(boardUrl(filters), { signal }),
      /**
       * Half a minute, against the roster's full one.
       *
       * Unlike the roster, this board really does change while it is being
       * looked at: a lead can reply at any moment, and that reply is what
       * opens the 24-hour window the cards are counting down. Stale here
       * means the desk is told it cannot type when it can.
       *
       * Polled for the same reason: a lead's reply arrives through a webhook,
       * so nothing in the browser knows it happened.
       */
      staleTime: 30_000,
      refetchInterval: 30_000,
    }),
};

export const thread = {
  key: (id: number) => ['lead', id] as const,

  options: (id: number) =>
    queryOptions({
      queryKey: thread.key(id),
      queryFn: ({ signal }) => getJson<LeadThread>(`/api/desk/leads/${id}`, { signal }),
      staleTime: 30_000,
    }),
};

export type NewLead = {
  name: string;
  phone: string;
  email?: string;
  source?: LeadSource;
  campaign?: string;
  note?: string;
  owner?: string;
};

export function addLead(input: NewLead) {
  return getJson<{ id: number; name: string }>('/api/desk/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function moveLead(id: number, stage: LeadStage) {
  return getJson<{ id: number; stage: LeadStage }>(`/api/desk/leads/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
}

export type SendInput = {
  body: string;
  /** Omitted for a freeform message, which is only legal inside the window. */
  template?: string;
  /** The template's own language code — Meta keys a template on both. */
  lang?: string;
  params?: string[];
};

/**
 * Send a message.
 *
 * A refusal comes back as a 422 whose `error` is already written for a
 * person — "their free reply window has closed, send a template instead" —
 * so the composer shows it verbatim rather than inventing its own wording.
 * `getJson` preserves it; see the note there.
 */
export function sendMessage(id: number, input: SendInput) {
  return getJson<{ message: unknown }>(`/api/desk/leads/${id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}
