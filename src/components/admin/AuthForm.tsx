'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn, signUp } from '@/lib/auth-client';

type Mode = 'login' | 'signup';

/**
 * The sign-in and sign-up form.
 *
 * One component for both because they differ by a single field and a single
 * call; two near-identical files would drift the moment either was touched.
 *
 * It navigates with `router.replace`, not `push`: the login screen should not
 * sit in the back stack, waiting to be reached by the browser's back button
 * from inside the office. `router.refresh()` follows because the shell is a
 * Server Component that has already rendered once for a signed-out visitor —
 * without it the sidebar would keep showing the signed-out state until
 * something else happened to re-fetch it.
 */
export default function AuthForm({
  mode,
  next,
  showSignupLink = true,
}: {
  mode: Mode;
  next: string;
  /** Login only: whether there is still an account to be made. */
  showSignupLink?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const name = String(data.get('name') ?? '').trim();

    const result = isSignup
      ? await signUp.email({ email, password, name })
      : await signIn.email({ email, password });

    if (result.error) {
      // Better Auth's own wording for the ordinary cases ("Invalid email or
      // password"); the fallback is for transport failures, which arrive with
      // no message at all.
      setError(result.error.message ?? 'Something went wrong. Try again.');
      setPending(false);
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {isSignup && (
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            disabled={pending}
            placeholder="Elias Kimaro"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus={!isSignup}
          disabled={pending}
          placeholder="you@meruclay.co.tz"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          // The browser must be told which of the two this is, or it offers to
          // save the old password over the new one.
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          required
          minLength={isSignup ? 8 : undefined}
          disabled={pending}
        />
        {isSignup && <p className="text-[12px] text-neutral-500">At least 8 characters.</p>}
      </div>

      {error && (
        // `role="alert"` so a screen reader hears the rejection; without it the
        // form simply appears not to have submitted.
        <p
          role="alert"
          className="rounded-md bg-clay-wash px-3 py-2 text-[13px] leading-5 text-clay-ink"
        >
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'One moment…' : isSignup ? 'Create account' : 'Sign in'}
      </Button>

      {(isSignup || showSignupLink) && (
        <p className="pt-1 text-center text-[13px] text-neutral-500">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <Link
                href="/admin/login"
                className="font-medium text-pine underline underline-offset-2"
              >
                Sign in
              </Link>
            </>
          ) : (
            <>
              Setting up the club office?{' '}
              <Link
                href="/admin/signup"
                className="font-medium text-pine underline underline-offset-2"
              >
                Create the first account
              </Link>
            </>
          )}
        </p>
      )}
    </form>
  );
}
