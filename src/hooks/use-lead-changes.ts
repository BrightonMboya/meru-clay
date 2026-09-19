'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { board as boardCache, thread as threadCache } from '@/lib/queries/leads';

/**
 * Hearing that something changed.
 *
 * The browser half of the seam described in src/lib/realtime.ts. It listens
 * for "lead N changed" and invalidates the right query; the data itself
 * still comes back through our own API. See that file for why.
 *
 * Polling stays switched on underneath this. That is not redundancy for its
 * own sake — a socket can drop, a laptop can sleep through a reconnect, and
 * the broadcast is explicitly allowed to fail. The poll is the floor: with
 * the socket up the desk sees a reply in about a second, and without it,
 * within ten. Nothing is ever permanently stale.
 */

/** One client per tab. Supabase opens a socket per client, so this matters. */
let client: SupabaseClient | null = null;

function supabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  client ??= createClient(url, key, {
    auth: { persistSession: false },
    // The desk is two people, not two thousand. Keeping this low means a
    // burst of messages cannot flood the tab.
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}

type Payload = { leadId: number | null };

/**
 * Subscribe while this component is mounted.
 *
 * `leadId` is the thread currently open, or null on the board. The board
 * refreshes on any change; an open thread refreshes only on its own — so a
 * busy pipeline does not re-fetch a conversation nobody is looking at.
 */
export function useLeadChanges(leadId: number | null): void {
  const qc = useQueryClient();

  useEffect(() => {
    const sb = supabase();
    if (!sb) return; // Not configured — polling alone.

    const channel = sb
      .channel('leads')
      .on('broadcast', { event: 'changed' }, ({ payload }) => {
        const changed = (payload as Payload)?.leadId ?? null;

        // The board's counts and card footers move on any change at all.
        qc.invalidateQueries({ queryKey: boardCache.key() });

        // The open conversation, only when it is the one that moved.
        if (leadId !== null && changed === leadId) {
          qc.invalidateQueries({ queryKey: threadCache.key(leadId) });
        }
      })
      .subscribe();

    return () => {
      // Leaves the channel but keeps the shared client, so moving between
      // the board and a thread does not tear down and rebuild the socket.
      sb.removeChannel(channel);
    };
  }, [leadId, qc]);
}
