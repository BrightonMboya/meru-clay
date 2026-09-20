/**
 * Better Auth — the server half.
 *
 * This is the single source of truth for authentication: the route handler at
 * src/app/api/auth/[...all]/route.ts is a thin wrapper around `auth.handler`,
 * and the browser client in src/lib/auth-client.ts only talks to that route.
 * Server code should call `auth.api.getSession({ headers: await headers() })`
 * rather than reading the cookie itself.
 *
 * It reuses the club's existing Postgres pool (src/lib/db/client.ts) through
 * Drizzle, so sessions live in the same database as bookings and there is no
 * second connection to keep an eye on.
 */

import { count } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

import { db } from './db/client';
import * as schema from './db/schema';

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error('BETTER_AUTH_SECRET is not set. See .env.example.');
}

export const auth = betterAuth({
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL,

  database: drizzleAdapter(db, {
    provider: 'pg',
    /**
     * The whole schema, not just the four auth tables — the adapter looks its
     * models up by name (`user`, `session`, `account`, `verification`) and
     * ignores the rest, and there is nothing else in here by those names.
     */
    schema,
    /**
     * The pooler hands a different backend to each statement in transaction
     * mode, so multi-statement transactions are not something to lean on
     * here. Better Auth runs its writes sequentially instead.
     */
    transaction: false,
  }),

  emailAndPassword: {
    enabled: true,
    /**
     * Eight is the floor rather than the default six. These accounts can read
     * every player's phone number and cancel anyone's booking.
     */
    minPasswordLength: 8,
  },

  user: {
    /**
     * Who is allowed to become an operator.
     *
     * /admin/signup is a public URL — it has to be, or the first account could
     * never be made — so the club would otherwise be one guessed path away
     * from a stranger with a staff login. The rule:
     *
     *   - an empty user table admits one account, the founding operator;
     *   - after that, signup is closed unless ADMIN_SIGNUP_OPEN is 'true'.
     *
     * To add a colleague: set ADMIN_SIGNUP_OPEN=true, have them sign up, unset
     * it. The check lives here rather than in the page because the page is not
     * the way in — POSTing /api/auth/sign-up/email is — and a gate the UI puts
     * up but the endpoint does not honour is decoration.
     */
    validateUserInfo: async ({ source }) => {
      if (source.action !== 'create-user') return;
      if (process.env.ADMIN_SIGNUP_OPEN === 'true') return;

      const [row] = await db.select({ n: count() }).from(schema.user);
      if ((row?.n ?? 0) === 0) return;

      return {
        error: 'signup_closed',
        errorDescription:
          'Signups are closed. An existing operator can open them with ADMIN_SIGNUP_OPEN.',
      };
    },
  },

  /**
   * Lets server actions and route handlers set the session cookie. Must stay
   * last in the list — it reads what the plugins before it produced.
   */
  plugins: [nextCookies()],
});
