import { redirect } from 'next/navigation';

import AuthForm from '@/components/admin/AuthForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { currentSession, signupOpen } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';

/**
 * Where `?next=` is allowed to point.
 *
 * Only inside the office. A redirect target taken from the query string and
 * followed unchecked is an open redirect: `/admin/login?next=https://…` would
 * make the club's own domain the first hop of somebody else's phishing link.
 * A leading `//` is the same trick spelled differently — the browser reads it
 * as protocol-relative — so both are rejected.
 */
function safeNext(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/admin';
  return next;
}

/**
 * A refusal that arrived as a redirect, not as a form submission.
 *
 * Better Auth sends browser flows here on failure (`onAPIError.errorURL` in
 * src/lib/auth.ts) with the reason in the query string — most often a magic
 * link for an address nobody invited. It is the library's own wording, and
 * it is written for the person reading it, so it is shown as given rather
 * than mapped through a table of codes this app would have to keep current.
 */
function refusal(params: { error?: string | string[]; error_description?: string | string[] }) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const described = one(params.error_description);
  if (described) return described;
  return one(params.error) ? 'That sign-in link could not be used.' : null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>;
}) {
  const [params, session, open] = await Promise.all([
    searchParams,
    currentSession(),
    signupOpen(),
  ]);
  const { next } = params;
  const destination = safeNext(next);
  const problem = refusal(params);

  // Already signed in: the login screen has nothing to ask.
  if (session) redirect(destination);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[17px]">Club office</CardTitle>
        <CardDescription>Sign in to reach the desk.</CardDescription>
      </CardHeader>
      <CardContent>
        {problem && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-clay-wash px-3 py-2 text-[13px] leading-5 text-clay-ink"
          >
            {problem}
          </p>
        )}
        {/* Only while there is an account to make; once the club has an
            operator the link leads to a refusal, which is not an invitation. */}
        <AuthForm mode="login" next={destination} showSignupLink={open} />
      </CardContent>
    </Card>
  );
}
