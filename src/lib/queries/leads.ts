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
import type { Lead } from '@/lib/admin/leads';
import type { Board, LeadThread } from '@/lib/admin/load';
import { formatLimits, type LaneLimits, type LeadSource, type LeadStage, type Period } from '@/lib/pipeline';
import { getJson } from './http';

export type { Board };

/**
 * What the screen is looking at. Part of the cache key, because a board
 * filtered to one campaign and the whole board are different answers and
 * must not overwrite each other.
 */
export type BoardFilters = {
  campaign: string | null;
  days: Period;
  /** Name, phone or their own words. */
  search: string | null;
  owner: string | null;
  /** Which lanes have been expanded past the first page, and how far. */
  limits: LaneLimits;
};

function boardUrl({ campaign, days, search, owner, limits }: BoardFilters): string {
  const q = new URLSearchParams({ days: String(days) });
  if (campaign) q.set('campaign', campaign);
  if (search) q.set('q', search);
  if (owner) q.set('owner', owner);
  const show = formatLimits(limits);
  if (show) q.set('show', show);
  return `/api/desk/leads?${q}`;
}

export const board = {
  /**
   * The bare key is the prefix every filtered board hangs off, so one
   * `invalidateQueries(['leads'])` after a write refreshes all of them —
   * the board being looked at, and any other the cache is still holding.
   */
  key: (filters?: BoardFilters) =>
    filters
      ? ([
          'leads',
          filters.campaign,
          filters.days,
          filters.search,
          filters.owner,
          formatLimits(filters.limits),
        ] as const)
      : (['leads'] as const),

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

/**
 * The board with one card already moved.
 *
 * Drag has to look instant — a card that hangs where it was dropped until the
 * round trip finishes reads as a broken board — so the drop writes this into
 * the cache and the server's answer replaces it a moment later. Every count
 * is recomputed from the lists it moved between, never adjusted by one, for
 * the same reason `buildBoard` counts rather than stores: a heading and the
 * cards beneath it must not be able to disagree, not even for 200ms.
 *
 * Returns the board untouched when the card is not on it, which is what
 * happens if a refetch landed between the drag starting and ending.
 */
export function moveOnBoard(board: Board, id: number, to: LeadStage): Board {
  let card: Lead | undefined;

  const without = board.columns.map((column) => {
    const found = column.leads.find((lead) => lead.id === id);
    if (!found) return column;
    card = found;
    // `count` is the whole lane and `leads` is only the page of it on
    // screen, so the two move by the same one but are not the same number.
    return {
      ...column,
      leads: column.leads.filter((lead) => lead.id !== id),
      count: Math.max(0, column.count - 1),
    };
  });

  if (!card) return board;

  // `lost` is a real stage with no column. The card leaves the board — the
  // count in the subtitle is where it reappears.
  if (to === 'lost') return { ...board, columns: without, lost: board.lost + 1 };

  const columns = without.map((column) =>
    column.stageKey === to
      ? // Straight to the top: a lead just touched is the most urgent thing
        // in the lane by the ordering the server uses, and the drop has to
        // land somewhere the eye can follow.
        { ...column, leads: [card!, ...column.leads], count: column.count + 1 }
      : column,
  );

  return { ...board, columns };
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
