'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * One query client per browser, a fresh one per server render.
 *
 * Reusing a single client across server renders would leak one visitor's
 * availability into another's page; making a new one on every browser render
 * would throw the cache away on each navigation. The `typeof window` split is
 * the standard resolution.
 */
let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * Availability goes stale the moment somebody else books, so nothing
         * is held fresh by default; the individual queries opt into a
         * refetch interval where it is worth the traffic.
         */
        staleTime: 0,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}

function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export default function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
