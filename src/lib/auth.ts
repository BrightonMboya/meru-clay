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
import { magicLink } from 'better-auth/plugins';

import {
  hasOpenInvite,
  inviteEmail,
  inviterNameFor,
  markInviteAccepted,
  signInEmail,
  userExists,
} from './admin/invites';
import { deliver, notifyEnv } from './notify';
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
     *   - an open invitation admits the address it was written for;
     *   - ADMIN_SIGNUP_OPEN='true' admits anyone, as an escape hatch.
     *
     * Inviting (/admin/invite) is the ordinary way to add a colleague. The
     * check lives here rather than in the page because the page is not the way
     * in — POSTing /api/auth/sign-up/email is, and so is following a magic
     * link — and a gate the UI puts up but the endpoint does not honour is
     * decoration.
     */
    validateUserInfo: async ({ user: candidate, source }) => {
      if (source.action !== 'create-user') return;
      if (process.env.ADMIN_SIGNUP_OPEN === 'true') return;

      const [row] = await db.select({ n: count() }).from(schema.user);
      if ((row?.n ?? 0) === 0) return;

      // Invited people are the standing exception, and the ordinary way a
      // second operator is added. The row is written by the invite screen
      // before the link is sent, so a magic link with no invitation behind
      // it — a forwarded one, say — arrives here and is turned away.
      const email = typeof candidate.email === 'string' ? candidate.email : '';
      if (email && (await hasOpenInvite(email))) return;

      return {
        error: 'signup_closed',
        errorDescription:
          'That address has not been invited to the club office. Ask an operator to send an invitation.',
      };
    },
  },

  /**
   * Where a refused browser flow lands, when nothing nearer says otherwise.
   *
   * Better Auth's default is /api/auth/error, a JSON endpoint that tells the
   * person nothing. The sign-in screen renders `error_description` instead.
   *
   * Note this does not cover the magic link: that flow redirects to the
   * `errorCallbackURL` given when the link was requested, falling back to its
   * `callbackURL`, and never consults this. The invite endpoint therefore
   * sets `errorCallbackURL` itself — see src/app/api/desk/invites/route.ts.
   */
  onAPIError: {
    errorURL: '/admin/login',
  },

  databaseHooks: {
    user: {
      create: {
        /**
         * An invitation is spent once the account exists. This runs for every
         * new user, including the founding operator, who has no invitation —
         * hence a no-op rather than an error when there is no row to close.
         */
        after: async (created) => {
          await markInviteAccepted(created.email);
        },
      },
    },
  },

  plugins: [
    magicLink({
      /**
       * A day, against the plugin's default of five minutes. These links are
       * mostly invitations, and an invitation that expires before the person
       * has looked at their email is an invitation that has to be sent again.
       * The exposure is bounded elsewhere: the token is single-use, and
       * `validateUserInfo` still requires an invitation to exist, so a link
       * that leaks after the fact opens nothing on its own.
       */
      expiresIn: 60 * 60 * 24,

      sendMagicLink: async ({ email, url }) => {
        const env = notifyEnv();

        /**
         * Without a mail provider there is nowhere for the link to go, and
         * the two sensible answers to that differ by environment. In
         * development, put it in the server log: invitations can then be
         * exercised end to end on a laptop with no Resend account, which is
         * the difference between this screen being testable and not. In
         * production, refuse — `deliver` returns quietly when mail is
         * unconfigured, and a silent no-op would show the operator a sent
         * invitation that never existed.
         */
        if (!env.RESEND_API_KEY) {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('RESEND_API_KEY is not set, so no invitation could be sent.');
          }
          console.log(`\n  magic link for ${email}:\n  ${url}\n`);
          return;
        }

        // Two different messages down one pipe: the plugin issues links both
        // to people being invited and to operators signing themselves back
        // in, and "you have been invited" is the wrong thing to send someone
        // who has worked here for a year.
        const known = await userExists(email);
        await deliver(
          env,
          known ? signInEmail(email, url) : inviteEmail(email, url, await inviterNameFor(email)),
        );
      },
    }),

    /**
     * Lets server actions and route handlers set the session cookie. Must stay
     * last in the list — it reads what the plugins before it produced.
     */
    nextCookies(),
  ],
});
