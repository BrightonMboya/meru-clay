import type { Metadata } from 'next';
import InstallApp from '@/components/admin/InstallApp';

export const metadata: Metadata = { title: 'Install the app — Meru Clay' };

/**
 * Where a newly invited colleague lands after opening their invitation (see
 * `newUserCallbackURL` in src/app/api/desk/invites/route.ts), and where the
 * account menu's "Install the app" goes. Inside the office, so it is only
 * ever seen by somebody signed in — which is what keeps installing the app to
 * people who were invited.
 */
export default function InstallPage() {
  return (
    <div className="flex min-w-0 grow flex-col gap-6 px-4 py-6 sm:px-10 sm:py-10">
      <header className="flex max-w-[560px] flex-col gap-[5px]">
        <h1 className="text-[26px] font-semibold leading-[32px] tracking-[-0.02em] text-pine sm:text-[28px] sm:leading-[34px]">
          Put the club office on your phone
        </h1>
        <p className="font-sans text-[15px] leading-[22px] text-neutral-500">
          Install it once and it opens like any other app, straight to who is on court next. Your
          sign-in carries over, and the last list stays readable when there is no signal.
        </p>
      </header>
      <div className="max-w-[560px]">
        <InstallApp />
      </div>
    </div>
  );
}
