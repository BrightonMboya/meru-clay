'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';

/** How often an open, visible screen re-asks the server. */
const EVERY_MS = 2 * 60_000;

/**
 * Keeps a server-rendered screen current without a reload.
 *
 * An installed app is not reloaded the way a tab is: the coach opens it from
 * the home screen and gets whatever it last showed. So the screen re-renders
 * whenever it comes back into view, every couple of minutes while it is
 * looked at, and on the button — `router.refresh()` re-runs the page on the
 * server and keeps scroll position.
 */
export default function KeepFresh() {
  const router = useRouter();
  const [pending, start] = useTransition();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') start(() => router.refresh());
    };
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, [router]);

  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 font-sans text-[13px] font-medium text-pine transition-colors hover:bg-neutral-50 disabled:opacity-60"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        aria-hidden
        className={pending ? 'animate-spin' : ''}
      >
        <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
      </svg>
      {pending ? 'Updating' : 'Refresh'}
    </button>
  );
}
