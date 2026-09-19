import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Migrations run over DIRECT_URL — Supabase's session-mode pooler (port 5432).
 * Transaction mode cannot hold the advisory lock drizzle-kit takes while it
 * applies DDL, so DATABASE_URL is only the fallback for setups that have one
 * connection string and nothing else.
 */
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './migrations/pg',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
