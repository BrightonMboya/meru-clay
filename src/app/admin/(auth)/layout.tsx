import type { Metadata } from 'next';

/**
 * The doorway.
 *
 * Deliberately not the office shell: there is no sidebar, no court status and
 * no desk query, because none of that can be loaded for someone the app does
 * not know yet. It keeps the office's white ground and Inter rather than the
 * marketing site's cream and Fraunces — this is the staff entrance, and it
 * should already feel like the tool.
 */
export const metadata: Metadata = {
  title: 'Sign in — Meru Clay',
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-white px-4 py-10 font-ui text-pine">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
