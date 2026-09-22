/**
 * The database connection.
 *
 * One `postgres.js` pool per process, cached on `globalThis` so Next's dev
 * server does not open a new one on every hot reload — the Supabase pooler
 * hands out a small, shared number of connections and will refuse the rest.
 *
 * `prepare: false` is not optional: DATABASE_URL points at Supabase's
 * transaction-mode pooler (port 6543), which hands a different backend to
 * each statement and so cannot keep a prepared statement alive between them.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const globalForDb = globalThis as unknown as { __meruSql?: ReturnType<typeof postgres> };

const sql =
  globalForDb.__meruSql ??
  postgres(url, {
    prepare: false,
    // The pooler is shared. A handful of connections is plenty for two courts.
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== 'production') globalForDb.__meruSql = sql;

export const db = drizzle(sql, { schema });
export { sql };

/**
 * `db`, or a transaction standing in for it.
 *
 * Most storage functions here talk to `db` directly, which is right: each is
 * one statement and one statement is already atomic. Fulfilling a payment is
 * the exception — it confirms a court and stamps the payment, and half of
 * that happening is a court somebody paid for that the club has no record of
 * selling. So the few functions `fulfil` calls take an executor and default
 * to `db`, which lets them be composed into one transaction without every
 * other caller having to know that transactions exist.
 */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
