/**
 * Who is signed in.
 *
 * The one place server code asks that question. Everything staff-only sits
 * behind `requireOperator`, and src/proxy.ts turns the same question away at
 * the door — but the proxy is a courtesy, not the lock. A matcher is easy to
 * narrow by accident and a Server Function is reached without passing one at
 * all, so the guard that matters is the one in the thing being guarded. Both
 * exist on purpose; neither is redundant.
 */

import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { count } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { user } from '@/lib/db/schema';
import { initialsOf } from '@/lib/roster';

/** Where an unauthenticated visitor is sent, and where they come back from. */
export const LOGIN_PATH = '/admin/login';

/**
 * The session, or null.
 *
 * `cache` scopes to the request, so the layout, the page and any Server
 * Function inside it share one lookup instead of hitting the database each.
 */
export const currentSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * The session, or a redirect to the login screen.
 *
 * `next` carries where they were headed so signing in lands them there rather
 * than dropping them on the desk every time.
 */
export async function requireOperator(returnTo?: string) {
  const session = await currentSession();
  if (!session) {
    redirect(returnTo ? `${LOGIN_PATH}?next=${encodeURIComponent(returnTo)}` : LOGIN_PATH);
  }
  return session;
}

/**
 * The signed-in user, shaped for the shell's operator row.
 *
 * This replaces the guess `loadOperator` was making — the first coach on the
 * roster — now that the app knows who is actually at the keyboard.
 */
export async function operatorFromSession() {
  const session = await currentSession();
  if (!session) return null;
  const { name, email, id } = session.user;
  const display = name.trim() || email;
  return {
    id,
    email,
    name: display,
    initials: initialsOf(display),
    role: 'Club office',
  };
}

/**
 * The 401 for the staff API.
 *
 * Route Handlers under /api/desk return this rather than redirecting: the
 * caller is the admin screen's own fetch, and a 302 to an HTML login page
 * would arrive at `res.json()` as a parse error rather than as "signed out".
 */
export async function requireOperatorApi(): Promise<Response | null> {
  const session = await currentSession();
  if (session) return null;
  return new Response(JSON.stringify({ error: 'Not signed in.' }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Whether anyone may still create an operator account.
 *
 * The same rule `user.validateUserInfo` enforces in src/lib/auth.ts — an empty
 * table admits the founding operator, ADMIN_SIGNUP_OPEN admits the rest. Asked
 * again on the way in so a closed door can look closed: the signup screen says
 * so outright, and the login screen stops offering a link to it.
 *
 * This is presentation. The endpoint is what actually refuses.
 */
export const signupOpen = cache(async () => {
  if (process.env.ADMIN_SIGNUP_OPEN === 'true') return true;
  const [row] = await db.select({ n: count() }).from(user);
  return (row?.n ?? 0) === 0;
});
