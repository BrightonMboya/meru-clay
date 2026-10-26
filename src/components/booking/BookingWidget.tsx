'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { capture } from '@/lib/analytics';
import type { Slot } from '@/lib/availability';
import { fmtTsh, totalFor } from '@/lib/pricing';
import { normalisePhone } from '@/lib/roster';
import {
  availability,
  createBooking,
  memberSessions,
  slotsFromError,
  statusOf,
  type AvailabilityPayload,
  type CreateBookingInput,
  type CreatedBooking,
  type MemberSessions,
} from '@/lib/queries/bookings';
import { startPayment } from '@/lib/queries/payments';

/** Re-exported so /book can keep importing its props from one place. */
export type { Slot };

export type Day = { iso: string; long: string; dow: string; day: string; mon: string };
export type CourtCol = {
  id: number;
  name: string;
  floodlit: boolean;
  badge: string;
  note: string | null;
};

const field =
  'rounded-[9px] border border-pine/[0.18] bg-white px-4 py-3 text-[15px] text-[#13271D] outline-none placeholder:text-[#9AA39B] focus:border-clay';

const pill =
  'group rounded-full border border-pine/[0.18] px-[26px] py-3 transition-colors aria-checked:border-clay aria-checked:bg-clay';
const pillText = 'text-[15px] font-semibold text-[#13271D] group-aria-checked:text-cream';

/** 990 -> "16:30", mirroring fmtTime24 in src/lib/time.ts. */
const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * The booking calendar. Client-side because every answer changes what the next
 * step can offer: the day, the length and whether the coach comes all re-ask
 * the server which start times are still free.
 *
 * `days` and `courts` are computed on the server and passed in — the date strip
 * has to start from the club's today, not the visitor's device clock.
 */
export default function BookingWidget({
  days,
  courts,
}: {
  days: Day[];
  courts: CourtCol[];
}) {
  const [date, setDate] = useState(days[0]?.iso ?? '');
  const [duration, setDuration] = useState(60);
  const [coach, setCoach] = useState(false);

  const [picked, setPicked] = useState<Slot | null>(null);
  const [error, setError] = useState('');
  /** Paying now, or spending a session from a pack bought earlier. */
  const [mode, setMode] = useState<'pay' | 'pack'>('pay');
  const [phone, setPhone] = useState('');
  /** Set only for a session booking; a payer leaves for /pay instead. */
  const [booked, setBooked] = useState<{
    id: string;
    when: string;
    reference: string;
    left: number;
  } | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  /**
   * The member, looked up as they type. `normalisePhone` only yields a number
   * once all of it is there, in whichever spelling — so this asks once per
   * complete number rather than once per keystroke.
   */
  const member = mode === 'pack' ? (normalisePhone(phone) ?? '') : '';
  const lookup = useQuery(memberSessions.options(member));
  const canSpend = Boolean(lookup.data?.found && lookup.data.left > 0);

  const price = totalFor(duration === 90 ? 90 : 60, coach);

  /**
   * Availability, keyed on every answer that changes it. React Query's key is
   * doing the work the old request-id guard used to: a response for a date the
   * player has already moved off belongs to a different cache entry, so it can
   * no longer land in the grid late.
   */
  const slotsQuery = useQuery(availability.options({ date, duration, coach }));
  const slots: Slot[] | null = slotsQuery.data?.slots ?? null;
  const loadFailed = slotsQuery.isError;

  const long = days.find((d) => d.iso === date)?.long ?? '';
  const durationLabel = duration === 60 ? '1 hour' : '1.5 hours';

  /**
   * Arrow-key movement across a radiogroup.
   *
   * `role="radio"` promises this — a screen reader announces the strip as a
   * set of options and its user expects arrows to move between them — so the
   * roles would be a lie without it. Roving focus, wrapping at both ends.
   */
  function onStripKey(
    e: React.KeyboardEvent<HTMLElement>,
    index: number,
    count: number,
    pick: (next: number) => void,
  ) {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : e.key === 'Home'
            ? -index
            : e.key === 'End'
              ? count - 1 - index
              : 0;
    if (delta === 0) return;

    e.preventDefault();
    const next = (index + delta + count) % count;
    pick(next);
    // Move focus with the selection, so the next arrow press continues from
    // where the user is rather than from where they started.
    const group = e.currentTarget.parentElement;
    const target = group?.querySelectorAll<HTMLElement>('[role="radio"]')[next];
    target?.focus();
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** Answering a question invalidates the answer below it. */
  function reset(apply: () => void) {
    apply();
    setPicked(null);
    setError('');
  }

  /** Write the slots the server handed back straight into the cache. */
  function replaceSlots(fresh: Slot[]) {
    queryClient.setQueryData<AvailabilityPayload>(
      availability.key({ date, duration, coach }),
      (prev) => ({ date, duration, coach, ...prev, slots: fresh }),
    );
  }

  /**
   * Claim the slot, then — for a payer — send the prompt and move to /pay,
   * which already knows how to wait for a handset and say what happened.
   *
   * Once the booking exists the page always goes to /pay, even if the prompt
   * was refused: pressing the button here again would hold a second court,
   * and /pay can take another number against the same booking.
   */
  const book = useMutation({
    mutationFn: async (input: CreateBookingInput): Promise<CreatedBooking> => {
      const created = await createBooking(input);
      if (created.paymentId) await startPayment(created.paymentId, input.phone).catch(() => {});
      return created;
    },
    onSuccess: (payload: CreatedBooking) => {
      capture('booking_confirmed', { paid_with: payload.paymentId ? 'payment' : 'session' });
      // The slot this player just took is gone for everyone.
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      if (payload.paymentId) {
        router.push(`/pay/${payload.paymentId}`);
        return;
      }
      setBooked({
        id: payload.id,
        when: `${payload.when} · ${payload.courtName}`,
        reference: payload.reference,
        left: payload.left ?? 0,
      });
      void queryClient.invalidateQueries({ queryKey: ['member-sessions'] });
    },
    onError: (err) => {
      capture('booking_failed', { status: statusOf(err), mode });
      const fresh = slotsFromError(err);
      if (statusOf(err) === 409 && fresh) {
        // The server hands back what is still free, so the grid refreshes
        // without a second round trip.
        replaceSlots(fresh);
        setPicked(null);
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    },
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) {
      setError('Pick a time first.');
      return;
    }

    setError('');
    // The "how many pressed pay" number, sessions or money.
    capture('booking_submitted', { mode, duration, coach, value: mode === 'pay' ? price : 0, currency: 'TZS' });
    const data = Object.fromEntries(new FormData(e.currentTarget)) as {
      name?: string;
      email?: string;
    };

    book.mutate({
      court: picked.court,
      start: picked.start,
      date,
      duration,
      coach,
      name: data.name ?? '',
      email: data.email,
      phone,
      pack: mode === 'pack',
    });
  }

  function switchMode(next: 'pay' | 'pack') {
    if (next !== mode) capture('booking_mode_chosen', { mode: next });
    setMode(next);
    setError('');
  }

  function bookAnother() {
    setBooked(null);
    setPicked(null);
    book.reset();
    formRef.current?.reset();
    void slotsQuery.refetch();
  }

  return (
    <div id="booking" className="rounded-[16px] border border-pine/[0.12] bg-[#FBF8F1] p-6 md:p-10">
      {/* Step 1 · date */}
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[12px] font-bold tracking-[0.18em] text-clay">01 · PICK A DAY</span>
          <span className="font-display text-[14px] italic text-[#67716A]">next 14 days</span>
        </div>
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
          role="radiogroup"
          aria-label="Date"
        >
          {days.map((d, i) => (
            <button
              key={d.iso}
              type="button"
              role="radio"
              aria-checked={d.iso === date}
              // Roving tabindex: one stop for the whole strip, not fourteen.
              tabIndex={d.iso === date ? 0 : -1}
              onKeyDown={(e) =>
                onStripKey(e, i, days.length, (n) => reset(() => setDate(days[n].iso)))
              }
              onClick={() => reset(() => setDate(d.iso))}
              className="group flex min-w-[76px] shrink-0 flex-col items-center gap-0.5 rounded-[10px] border border-pine/[0.18] px-3 py-3 transition-colors aria-checked:border-clay aria-checked:bg-clay"
            >
              <span className="text-[11px] font-bold tracking-[0.12em] text-[#5F6B62] group-aria-checked:text-[#FBE6DE]">
                {d.dow.toUpperCase()}
              </span>
              <span className="font-display text-[24px] leading-[28px] text-[#13271D] group-aria-checked:text-cream">
                {d.day}
              </span>
              <span className="text-[11px] font-medium text-[#5F6B62] group-aria-checked:text-[#FBE6DE]">
                {d.mon.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/*
        Step 2 · the session. Duration and coach sit together because they are the
        same question — what kind of session — and both change which times step 3
        can offer, so both have to be answered before the grid means anything.
      */}
      <div className="flex flex-col gap-5 pt-8">
        <span className="text-[12px] font-bold tracking-[0.18em] text-clay">02 · THE SESSION</span>

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] text-[#5C6159]">How long</span>
          <div className="flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label="Duration">
            {[
              { minutes: 60, label: '1 hour' },
              { minutes: 90, label: '1.5 hours' },
            ].map((d, i, all) => (
              <button
                key={d.minutes}
                type="button"
                role="radio"
                aria-checked={duration === d.minutes}
                tabIndex={duration === d.minutes ? 0 : -1}
                onKeyDown={(e) =>
                  onStripKey(e, i, all.length, (n) => reset(() => setDuration(all[n].minutes)))
                }
                onClick={() => reset(() => setDuration(d.minutes))}
                className={pill}
              >
                <span className={pillText}>{d.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] text-[#5C6159]">Coaching</span>
          <div className="flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label="Coaching">
            {[
              { value: false, label: 'Just the court' },
              { value: true, label: 'Play with a coach' },
            ].map((c, i, all) => (
              <button
                key={c.label}
                type="button"
                role="radio"
                aria-checked={coach === c.value}
                tabIndex={coach === c.value ? 0 : -1}
                onKeyDown={(e) =>
                  onStripKey(e, i, all.length, (n) => reset(() => setCoach(all[n].value)))
                }
                // Whether the coach comes changes which times are free, not just price.
                onClick={() => reset(() => setCoach(c.value))}
                className={pill}
              >
                <span className={pillText}>{c.label}</span>
              </button>
            ))}
          </div>
          {coach && (
            <p className="font-display text-[14px] italic leading-[22px] text-[#67716A]">
              Fewer times below — there is one coach, and they can only be on one court at a time.
            </p>
          )}
        </div>
      </div>

      {/* Step 3 · slot, grouped by court */}
      <div className="flex flex-col gap-4 pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[12px] font-bold tracking-[0.18em] text-clay">03 · PICK A TIME</span>
          <span className="font-display text-[14px] italic text-[#67716A]">
            {slots?.length ? `${slots.length} start${slots.length === 1 ? '' : 's'} left` : ''}
          </span>
        </div>

        <div className="grid gap-6 sm:grid-cols-2" role="radiogroup" aria-label="Time">
          {courts.map((court) => {
            const mine = slots?.filter((s) => s.court === court.id) ?? [];
            return (
              <div key={court.id} className="flex min-w-0 flex-col gap-3.5">
                <div className="flex items-center gap-2 border-b border-pine/[0.14] pb-3">
                  <span className="font-display text-[18px] text-[#13271D]">{court.name}</span>
                  <span
                    className={`rounded-full px-[9px] py-[3px] text-[10px] font-bold tracking-[0.1em] ${
                      court.floodlit
                        ? 'bg-clay/[0.13] text-[#9C4225]'
                        : 'bg-pine/[0.07] text-[#55605A]'
                    }`}
                  >
                    {court.badge}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2" aria-live="polite">
                  {loadFailed ? (
                    <p className="py-2 text-[15px] text-[#9C4225]">
                      Could not load times. Please refresh.
                    </p>
                  ) : slots === null ? (
                    <p className="py-2 text-[15px] text-[#67716A]">Loading times…</p>
                  ) : mine.length === 0 ? (
                    <p className="py-2 text-[15px] text-[#67716A]">Nothing free here today.</p>
                  ) : (
                    mine.map((s, i) => (
                      <button
                        key={s.start}
                        type="button"
                        role="radio"
                        aria-checked={picked?.court === s.court && picked?.start === s.start}
                        tabIndex={
                          picked?.court === s.court && picked?.start === s.start
                            ? 0
                            : picked?.court === court.id || i > 0
                              ? -1
                              : 0
                        }
                        onKeyDown={(e) =>
                          onStripKey(e, i, mine.length, (n) => {
                            setPicked(mine[n]);
                            setError('');
                          })
                        }
                        onClick={() => {
                          setPicked(s);
                          setError('');
                          capture('booking_slot_picked', { court: s.court, date, duration, coach });
                        }}
                        className="w-[106px] rounded-[9px] border border-pine/[0.18] px-0 py-[11px] text-center text-[16px] font-semibold text-[#13271D] transition-colors aria-checked:border-clay aria-checked:bg-clay aria-checked:text-white"
                      >
                        {hhmm(s.start)}
                      </button>
                    ))
                  )}
                </div>
                {court.note && (
                  <p className="font-display text-[14px] italic leading-[22px] text-[#67716A]">
                    {court.note}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 4 · who, and how it is paid for */}
      {!booked && (
        <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4 pt-8" noValidate>
          <span className="text-[12px] font-bold tracking-[0.18em] text-clay">
            04 · WHO’S PLAYING
          </span>

          <div className="flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label="How you pay">
            {(
              [
                { value: 'pay', label: 'Pay now' },
                { value: 'pack', label: 'I have sessions' },
              ] as const
            ).map((m, i, all) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                tabIndex={mode === m.value ? 0 : -1}
                onKeyDown={(e) => onStripKey(e, i, all.length, (n) => switchMode(all[n].value))}
                onClick={() => switchMode(m.value)}
                className={pill}
              >
                <span className={pillText}>{m.label}</span>
              </button>
            ))}
          </div>

          {mode === 'pay' ? (
            <>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-[#5C6159]">Name</span>
                  <input name="name" required autoComplete="name" className={field} placeholder="Asha Mollel" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-[#5C6159]">Mobile money number</span>
                  <input
                    name="phone"
                    required
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    className={field}
                    placeholder="0712 345 678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] text-[#5C6159]">
                  Email <span className="opacity-70">— optional, for your confirmation</span>
                </span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  className={field}
                  placeholder="you@example.com"
                />
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-[#5C6159]">The number you paid for your sessions with</span>
              <input
                name="phone"
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className={field}
                placeholder="0712 345 678 or +255 712 345 678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <MemberLine lookup={lookup} typed={phone.trim() !== ''} valid={member !== ''} />
            </label>
          )}

          {error && (
            <p
              className="rounded-[9px] border border-clay/40 bg-clay/10 px-4 py-3 text-[14px] text-[#9C4225]"
              role="alert"
            >
              {error}
            </p>
          )}

          {/* Summary + commit */}
          <div className="mt-3.5 flex flex-col gap-5 rounded-[12px] border border-clay/30 bg-clay/10 px-[26px] py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <span className="font-display text-[24px] leading-[28px] text-[#13271D]">
                {picked
                  ? `${courts.find((c) => c.id === picked.court)?.name ?? `Court ${picked.court}`} · ${hhmm(picked.start)}–${hhmm(picked.end)}`
                  : 'Pick a time above'}
              </span>
              <span className="text-[14px] text-[#5C6159]">
                {[long, durationLabel, ...(coach ? ['with a coach'] : [])].join(' · ')}
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <button
                type="submit"
                disabled={!picked || book.isPending || (mode === 'pack' && !canSpend)}
                className="self-start rounded-full bg-clay px-[38px] py-4 text-[16px] font-semibold text-white transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 sm:self-auto"
              >
                {mode === 'pay'
                  ? book.isPending
                    ? 'Sending the prompt…'
                    : `Pay TSh ${fmtTsh(price)}`
                  : book.isPending
                    ? 'Booking…'
                    : 'Book with a session'}
              </button>
              <span className="text-[12.5px] text-[#5C6159]">
                {mode === 'pay'
                  ? 'M-Pesa, Airtel Money, Mixx or Halotel — approve the prompt on your phone'
                  : 'uses one session from your pack'}
              </span>
            </div>
          </div>
        </form>
      )}

      {/* A member who booked with a session: confirmed on the spot. A payer
          never sees this — they are on /pay, waiting for their prompt. */}
      {booked && (
        <div className="mt-8 flex flex-col gap-6 rounded-[12px] border border-clay/30 bg-clay/10 p-7 md:p-9">
          <div className="flex flex-col gap-2.5">
            <span className="text-[12px] font-bold tracking-[0.18em] text-clay">COURT BOOKED</span>
            <p className="font-display text-[30px] leading-[36px] text-[#13271D]">{booked.when}</p>
            <p className="text-[14px] text-[#5C6159]">
              Reference <span className="font-mono text-[#13271D]">{booked.reference}</span>
            </p>
          </div>

          <p className="border-t border-clay/25 pt-6 text-[15px] leading-[25px] text-[#3C3F38]">
            One session used —{' '}
            <strong>
              {booked.left === 0
                ? 'that was your last one'
                : `${booked.left} session${booked.left === 1 ? '' : 's'} left`}
            </strong>
            . Cancel from the link below before it starts and the session comes back to you.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {/* The only route back to a booking: there are no accounts, so the
                id in this link is what proves it is theirs. */}
            <Link
              href={`/book/${booked.id}`}
              className="rounded-full bg-clay px-[26px] py-[11px] text-[15px] font-semibold text-white transition-transform hover:scale-[1.03]"
            >
              View or cancel this booking
            </Link>
            <button
              type="button"
              onClick={bookAnother}
              className="rounded-full border border-pine/25 px-[26px] py-[11px] text-[15px] text-[#13271D] transition-colors hover:bg-pine/5"
            >
              Book another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * What the lookup found, under the number field — the line a member reads to
 * know whether they can book with a session.
 */
function MemberLine({
  lookup,
  typed,
  valid,
}: {
  lookup: { data?: MemberSessions; isFetching: boolean; isError: boolean };
  typed: boolean;
  valid: boolean;
}) {
  const base = 'text-[13.5px] leading-[21px]';
  if (!valid) {
    return (
      <span className={`${base} text-[#5C6159]`}>
        {typed
          ? 'Keep going — 07…, 7…, or +255… all work.'
          : 'We’ll look up how many sessions you have left.'}
      </span>
    );
  }
  if (lookup.isError) {
    return <span className={`${base} text-[#9C4225]`}>Could not look that up. Try again.</span>;
  }
  const found = lookup.data;
  if (!found) return <span className={`${base} text-[#5C6159]`}>Looking you up…</span>;
  if (!found.found || found.bought === 0) {
    return (
      <span className={`${base} text-[#9C4225]`}>
        We can’t find sessions on that number. Choose “Pay now”, or become a member from the home
        page.
      </span>
    );
  }
  if (found.left === 0) {
    return (
      <span className={`${base} text-[#9C4225]`}>
        Hi {found.firstName} — you’ve used all {found.bought} sessions. Choose “Pay now” for this
        one, or top up from the home page.
      </span>
    );
  }
  return (
    <span className={`${base} font-semibold text-[#13271D]`}>
      Hi {found.firstName} — you have {found.left} of {found.bought} session
      {found.bought === 1 ? '' : 's'} left.
    </span>
  );
}
