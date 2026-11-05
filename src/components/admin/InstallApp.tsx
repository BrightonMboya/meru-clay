'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { installState, onInstallChange, promptInstall, type InstallState } from '@/lib/install';

/**
 * The install step, for somebody already signed in to the office.
 *
 * What it shows depends on what the browser can do: a button where Chrome
 * hands us its install dialog, the Share-sheet steps on an iPhone, the
 * browser-menu steps anywhere else, and "you are in the app" once installed.
 */
export default function InstallApp() {
  // Null on the server and through hydration: the server cannot know the
  // browser, so nothing state-specific renders until the client says.
  const state = useSyncExternalStore<InstallState | null>(onInstallChange, installState, () => null);
  const [busy, setBusy] = useState(false);

  if (state === null) return <div className="h-40" aria-hidden />;

  if (state === 'installed') {
    return (
      <Panel>
        <p className="text-[15px] font-semibold text-pine">The app is installed.</p>
        <p className="text-[14px] leading-[21px] text-neutral-600">
          Open Meru Clay from your home screen. It starts on Upcoming.
        </p>
        <Continue />
      </Panel>
    );
  }

  if (state === 'prompt') {
    return (
      <Panel>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await promptInstall();
            setBusy(false);
          }}
          className="inline-flex h-11 items-center justify-center rounded-full bg-clay px-6 text-[15px] font-semibold text-white transition-colors hover:bg-clay/90 disabled:opacity-60"
        >
          {busy ? 'Installing…' : 'Install the app'}
        </button>
        <Continue />
      </Panel>
    );
  }

  return (
    <Panel>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-[22px] text-pine">
        {state === 'ios' ? (
          <>
            <li>
              Open this page in <strong>Safari</strong>.
            </li>
            <li>
              Tap the <strong>Share</strong> button (the square with an arrow).
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </li>
          </>
        ) : (
          <>
            <li>
              Open your browser&apos;s menu (<strong>⋮</strong> in Chrome).
            </li>
            <li>
              Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
            </li>
          </>
        )}
      </ol>
      <Continue />
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border border-neutral-200 p-5">
      {children}
    </div>
  );
}

function Continue() {
  return (
    <Link
      href="/admin/upcoming"
      className="font-sans text-[14px] font-medium text-neutral-500 underline-offset-4 hover:text-pine hover:underline"
    >
      Continue to Upcoming
    </Link>
  );
}
