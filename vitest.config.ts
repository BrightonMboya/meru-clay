import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Tests run against a real, disposable Postgres — never the club's database.
 *
 * `tests/global-setup.ts` starts one (a Docker container, or the service
 * container CI provides through TEST_DATABASE_URL), applies every migration
 * in migrations/pg, and refuses to go on if the URL is not a local one.
 * Real Postgres rather than a mock because the things worth testing here are
 * Postgres: the advisory locks, the CHECK constraints, the partial unique
 * indexes that make fulfilment idempotent.
 *
 * One database, so test files run one at a time.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Next resolves this to nothing on the server; outside Next it throws.
      'server-only': fileURLToPath(new URL('./tests/stubs/empty.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
    include: ['tests/**/*.test.ts'],
    // @axiomhq/nextjs imports 'next/server' the way a bundler resolves it,
    // not the way Node's ESM loader does; let Vite resolve it, as Next would.
    server: { deps: { inline: [/@axiomhq\/nextjs/] } },
  },
});
