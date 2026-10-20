import { execFileSync } from 'node:child_process';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

/**
 * A throwaway Postgres for the whole run.
 *
 * TEST_DATABASE_URL wins when set (CI provides a service container). Otherwise
 * a `postgres:16` container is started on a free port and removed at the end.
 * Either way every migration is applied from scratch, so the tests run on the
 * schema production runs on — including the courts seed.
 */

const IMAGE = process.env.TEST_PG_IMAGE ?? 'postgres:16';

/** Refuse anything that is not on this machine. The club's data is not a fixture. */
export function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(`Refusing to run tests against ${host}: tests only run on a local database.`);
  }
}

export default async function setup(project: TestProject) {
  let url = process.env.TEST_DATABASE_URL;
  let container: string | null = null;

  if (!url) {
    container = execFileSync(
      'docker',
      ['run', '-d', '--rm', '-e', 'POSTGRES_PASSWORD=test', '-p', '127.0.0.1::5432', IMAGE],
      { encoding: 'utf8' },
    ).trim();
    const port = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' })
      .trim()
      .split('\n')[0]
      .split(':')
      .pop();
    url = `postgres://postgres:test@127.0.0.1:${port}/postgres`;
  }

  assertLocal(url);
  await waitFor(url);

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: './migrations/pg' });
  await sql.end();

  project.provide('databaseUrl', url);

  return () => {
    if (container) execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  };
}

async function waitFor(url: string) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const sql = postgres(url, { max: 1, connect_timeout: 2, onnotice: () => {} });
    try {
      await sql`select 1`;
      await sql.end();
      return;
    } catch (err) {
      await sql.end({ timeout: 0 }).catch(() => {});
      if (Date.now() > deadline) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
