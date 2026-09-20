'use client';

import { Dialog } from 'radix-ui';
import { useState } from 'react';

const SESSIONS = [4, 8, 16, 20];

/**
 * The membership form, in a modal.
 *
 * Built on Radix's Dialog rather than the club's own markup for the parts
 * that are easy to get wrong and invisible when you do: focus moves into the
 * panel and is held there, Escape and the backdrop close it, the page behind
 * stops scrolling, and the title is announced. The look is hand-written,
 * because this is the marketing side and shares nothing with the office.
 *
 * `children` is the button that opens it, so the two places it appears can
 * each keep their own styling — a filled pill in the hero, an outline one at
 * the foot of the page.
 */
export default function JoinDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [withKid, setWithKid] = useState(false);
  const [sessions, setSessions] = useState(8);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const ready = name.trim().length >= 2 && phone.trim().length > 0 && email.trim().length > 0;

  function reset() {
    setName('');
    setPhone('');
    setEmail('');
    setWithKid(false);
    setSessions(8);
    setError(null);
    setDone(false);
  }

  // Closing is the end of the exchange either way, so clear it out — but only
  // once the panel has gone, or the form visibly empties itself on the way.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setTimeout(reset, 200);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          withKid,
          sessions,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('We could not reach the club. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-pine/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Pinned to the top on a phone rather than centred: the keyboard
            takes half the screen the moment a field is focused, and a
            vertically centred panel gets shoved off the top of it. */}
        <Dialog.Content className="fixed left-1/2 top-4 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[440px] -translate-x-1/2 overflow-y-auto rounded-3xl bg-cream p-7 shadow-2xl outline-none sm:top-1/2 sm:-translate-y-1/2 sm:p-9 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
          {done ? (
            <div className="flex flex-col items-start">
              <Dialog.Title className="font-display text-[30px] font-medium leading-[1.1] tracking-[-0.02em] text-pine">
                Welcome to the clay.
              </Dialog.Title>
              <Dialog.Description className="pt-4 text-[15px] leading-[24px] text-pine/70">
                We have your details. Someone from the club will be in touch on WhatsApp shortly to
                talk through membership and find you a first session.
              </Dialog.Description>
              <Dialog.Close className="mt-7 rounded-full bg-pine px-[26px] py-[13px] text-[15px] font-semibold text-cream transition-transform hover:scale-[1.03]">
                Close
              </Dialog.Close>
            </div>
          ) : (
            <form onSubmit={send} className="flex flex-col">
              <Dialog.Title className="font-display text-[30px] font-medium leading-[1.1] tracking-[-0.02em] text-pine">
                Become a member
              </Dialog.Title>
              <Dialog.Description className="pt-3 text-[15px] leading-[23px] text-pine/70">
                Tell us how you play and we will call you back on WhatsApp.
              </Dialog.Description>

              <div className="flex flex-col gap-5 pt-7">
                <Field label="Full name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                    maxLength={80}
                    className={inputClass}
                  />
                </Field>

                <Field label="Phone number" hint="We reach members on WhatsApp">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    placeholder="0712 345 678"
                    className={inputClass}
                  />
                </Field>

                <Field label="Email">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    maxLength={160}
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </Field>

                <Field label="Sessions a month">
                  <div className="relative">
                    <select
                      value={sessions}
                      onChange={(e) => setSessions(Number(e.target.value))}
                      className={`${inputClass} cursor-pointer appearance-none pr-11`}
                    >
                      {SESSIONS.map((n) => (
                        <option key={n} value={n}>
                          {n} sessions
                        </option>
                      ))}
                    </select>
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-pine/40"
                    >
                      <path
                        d="M4 6.5 8 10.5l4-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </Field>

                <label className="flex cursor-pointer items-center gap-3 text-[15px] text-pine">
                  <input
                    type="checkbox"
                    checked={withKid}
                    onChange={(e) => setWithKid(e.target.checked)}
                    className="h-[18px] w-[18px] shrink-0 cursor-pointer rounded border-pine/30 accent-clay"
                  />
                  I&apos;ll be coming with a child
                </label>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="mt-5 rounded-xl bg-clay-wash px-4 py-3 text-[14px] leading-[21px] text-clay-ink"
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={!ready || sending}
                className="mt-7 rounded-full bg-clay px-[30px] py-4 text-[15px] font-semibold text-white transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100"
              >
                {sending ? 'Sending…' : 'Send my details'}
              </button>
            </form>
          )}

          <Dialog.Close
            aria-label="Close"
            className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-pine/40 transition-colors hover:bg-pine/5 hover:text-pine"
          >
            <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4">
              <path
                d="m4 4 8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            </svg>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const inputClass =
  'w-full rounded-xl border border-pine/15 bg-white px-4 py-[13px] text-[15px] text-pine outline-none transition-colors placeholder:text-pine/30 focus:border-clay';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold tracking-[0.02em] text-pine">{label}</span>
        {hint ? <span className="text-[12px] text-pine/45">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
