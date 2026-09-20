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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [{ next }, session, open] = await Promise.all([
    searchParams,
    currentSession(),
    signupOpen(),
  ]);
  const destination = safeNext(next);

  // Already signed in: the login screen has nothing to ask.
  if (session) redirect(destination);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[17px]">Club office</CardTitle>
        <CardDescription>Sign in to reach the desk.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Only while there is an account to make; once the club has an
            operator the link leads to a refusal, which is not an invitation. */}
        <AuthForm mode="login" next={destination} showSignupLink={open} />
      </CardContent>
    </Card>
  );
}
