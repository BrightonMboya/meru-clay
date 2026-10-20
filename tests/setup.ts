import { AsyncLocalStorage } from 'node:async_hooks';
import { inject, vi } from 'vitest';
import { assertLocal } from './global-setup';

/**
 * Runs before each test file's imports, so `src/lib/db/client.ts` connects
 * to the throwaway database. Everything that would leave the machine — mail,
 * WhatsApp, Supabase broadcasts — is switched off by leaving its credentials
 * unset; the mocks below make that explicit rather than relying on it.
 */
const url = inject('databaseUrl');
assertLocal(url);
process.env.DATABASE_URL = url;
for (const key of [
  'RESEND_API_KEY',
  'BOOKING_TO_EMAIL',
  'WHATSAPP_TOKEN',
  'SNIPPE_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'AXIOM_TOKEN',
]) {
  delete process.env[key];
}

// Next's server sets this up before any route runs; the Axiom package relies on it.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;

vi.mock('@/lib/realtime', () => ({ publish: vi.fn(async () => {}) }));

// `after()` only works inside a Next request; run the callback straight away.
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: (fn: (() => unknown) | Promise<unknown>) => {
    void (typeof fn === 'function' ? fn() : fn);
  },
}));
