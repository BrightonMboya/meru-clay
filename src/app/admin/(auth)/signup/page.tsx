import Link from 'next/link';
import { redirect } from 'next/navigation';

import AuthForm from '@/components/admin/AuthForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { currentSession, signupOpen } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const [session, open] = await Promise.all([currentSession(), signupOpen()]);

  if (session) redirect('/admin');

  if (!open) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-[17px]">Signups are closed</CardTitle>
          <CardDescription>
            The club office already has an operator. To add another, set{' '}
            <code className="rounded bg-neutral-100 px-1 py-0.5 text-[12px]">
              ADMIN_SIGNUP_OPEN=true
            </code>{' '}
            in the server environment, create the account, then unset it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/admin/login"
            className="text-[13px] font-medium text-pine underline underline-offset-2"
          >
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[17px]">Create the first account</CardTitle>
        <CardDescription>
          This is the founding operator. Once it exists, signups close on their own.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm mode="signup" next="/admin" />
      </CardContent>
    </Card>
  );
}
