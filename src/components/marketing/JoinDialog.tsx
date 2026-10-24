'use client';

import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { MEMBERSHIP_TIERS, SESSION_PACKS, fmtTsh } from '@/lib/pricing';
import { statusOf } from '@/lib/queries/http';
import { resendPrompt, startPayment } from '@/lib/queries/payments';

/**
 * The membership form, in a modal.
 *
 * Membership is a pack of sessions paid for up front, or the Kids membership
 * — a month of group classes — so this is a checkout: name, number, a plan,
 * then the mobile money prompt. Kids is a parent signing a child up, so the
 * fields say whose name and whose number. The same two calls the
 * trial form makes — `/api/join` opens the payment, the shared
 * `/api/payments/:id/pay` sends the prompt — and then /pay/<id> takes over,
 * which already knows how to wait for a handset and say what happened.
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
export default function JoinDialog({
  children,
  sessions: initialSessions = 8,
  kids: initialKids = false,
}: {
  children: React.ReactNode;
  /** The pack the form opens on — the one whose button was pressed. */
  sessions?: number;
  /** Open on the Kids membership instead of a pack. */
  kids?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [withKid, setWithKid] = useState(false);
  const [sessions, setSessions] = useState<number>(initialSessions);
  const [kids, setKids] = useState(initialKids);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length >= 2 && phone.trim().length > 0;
  const pack = SESSION_PACKS.find((p) => p.sessions === sessions) ?? SESSION_PACKS[1];
  const fee = kids ? MEMBERSHIP_TIERS.kids.fee : pack.fee;

  function reset() {
    setName('');
    setPhone('');
    setWithKid(false);
    setSessions(initialSessions);
    setKids(initialKids);
    setError(null);
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
        body: JSON.stringify(
          kids
            ? { name: name.trim(), phone: phone.trim(), plan: 'kids' }
            : { name: name.trim(), phone: phone.trim(), withKid, sessions },
        ),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.id) {
        setError(body?.error ?? 'Something went wrong. Please try again.');
        return;
      }

      const id: string = body.id;
      if (body.status === 'processing') {
        // A prompt from a moment ago is still live; push the same one again.
        await resendPrompt(id).catch(() => {});
      } else if (body.status !== 'successful') {
        try {
          await startPayment(id, phone.trim());
        } catch (err) {
          // A refusal Snippe could account for — a number on no network —
          // stays here so they can fix it; the next press reuses the payment.
          const s = statusOf(err);
          if (s !== 409 && s !== 502) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
            return;
          }
        }
      }
      router.push(`/pay/${id}`);
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
          <form onSubmit={send} className="flex flex-col">
            <Dialog.Title className="font-display text-[30px] font-medium leading-[1.1] tracking-[-0.02em] text-pine">
              Become a member
            </Dialog.Title>
            <Dialog.Description className="pt-3 text-[15px] leading-[23px] text-pine/70">
              Pick a pack of sessions, or Kids for unlimited group classes, and pay by mobile
              money — no cash at the gate.
            </Dialog.Description>

            <div className="flex flex-col gap-5 pt-7">
              <Field label={kids ? "Child's full name" : 'Full name'}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                  maxLength={80}
                  className={inputClass}
                />
              </Field>

              <Field
                label={kids ? "Parent's mobile money number" : 'Mobile money number'}
                hint={kids ? 'We message you about classes' : 'Your number to book with'}
              >
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

              <Field label="Membership">
                <div className="relative">
                  <select
                    value={kids ? 'kids' : sessions}
                    onChange={(e) => {
                      const v = e.target.value;
                      setKids(v === 'kids');
                      if (v !== 'kids') setSessions(Number(v));
                    }}
                    className={`${inputClass} cursor-pointer appearance-none pr-11`}
                  >
                    {SESSION_PACKS.map((p) => (
                      <option key={p.sessions} value={p.sessions}>
                        {p.label} — TSh {fmtTsh(p.fee)}
                      </option>
                    ))}
                    <option value="kids">
                      Kids, unlimited group classes — TSh {fmtTsh(MEMBERSHIP_TIERS.kids.fee)} a month
                    </option>
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

              {!kids && (
                <label className="flex cursor-pointer items-center gap-3 text-[15px] text-pine">
                  <input
                    type="checkbox"
                    checked={withKid}
                    onChange={(e) => setWithKid(e.target.checked)}
                    className="h-[18px] w-[18px] shrink-0 cursor-pointer rounded border-pine/30 accent-clay"
                  />
                  I&apos;ll be coming with a child
                </label>
              )}
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
              {sending ? 'Sending the prompt…' : `Pay TSh ${fmtTsh(fee)}`}
            </button>
          </form>

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
