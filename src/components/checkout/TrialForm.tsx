'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { trackOnce } from '@/lib/pixel';
import { availability } from '@/lib/queries/bookings';
import { getJson, statusOf } from '@/lib/queries/http';
import { resendPrompt, startPayment } from '@/lib/queries/payments';
import { fmtDayLabel, fmtLongDay, fmtTime24 } from '@/lib/time';

/** The ad's own tags, carried onto the lead so the board can say which ad paid. */
const TRACKED = ['utm_source', 'utm_campaign', 'fbclid'] as const;

/**
 * A trial is an hour — see TRIAL_MINUTES in src/lib/trial.ts. Asked as a
 * court-only hour: the coach is always there for a trial, so only the courts
 * decide which times are free.
 */
const SESSION = { duration: 60, coach: false } as const;

/**
 * Name, number, day and time — then the USSD prompt.
 *
 * The times are /book's: the same availability query, so a time offered
 * here is one with a court free. Which court is the club's business, so the
 * courts are folded into one row of start times.
 *
 * Two calls in a row: `/api/trial` writes the lead and opens the payment,
 * then the shared `/api/payments/:id/pay` sends the prompt. Once it is out,
 * the visitor is moved to /pay/<id>, which already knows how to wait for a
 * handset, poll, and say what happened — this form does not reimplement it.
 *
 * A refusal Snippe could account for (a number on no network, say) stays
 * here so they can fix the number and press again; the second press reuses
 * the same payment. Anything else — a prompt already out, an answer that
 * never came back — goes to /pay, which has the wording for both.
 */
export default function TrialForm({ days, fee }: { days: string[]; fee: number }) {
  const router = useRouter();
  const [date, setDate] = useState('');
  const [start, setStart] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const tags = useRef<Record<string, string>>({});

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    for (const k of TRACKED) {
      const v = q.get(k);
      if (v) tags.current[k] = v;
    }
  }, []);

  const book = useMutation({
    mutationFn: async (input: { name: string; phone: string; date: string; start: number }) => {
      const opened = await getJson<{ ok: true; id: string; status: string }>('/api/trial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...input, ...tags.current }),
      });
      // A Lead the moment there is somebody to follow up: name, number, a
      // day, and a payment waiting. Once per payment, so pressing the button
      // again after a declined prompt is not a second lead.
      trackOnce(
        opened.id,
        'Lead',
        { content_name: 'Trial session', value: fee, currency: 'TZS' },
        `lead-${opened.id}`,
      );
      if (opened.status === 'successful') return opened.id;
      if (opened.status === 'processing') {
        // Snippe says the last prompt is still live, but they filled the form
        // in again because it is not on their phone: push the same one again.
        // Best effort — /pay has the button if this does not land.
        await resendPrompt(opened.id).catch(() => {});
        return opened.id;
      }

      try {
        await startPayment(opened.id, input.phone);
      } catch (err) {
        const s = statusOf(err);
        if (s === 409 || s === 502) return opened.id;
        throw err;
      }
      return opened.id;
    },
    onSuccess: (id) => router.push(`/pay/${id}`),
    onError: (err) => {
      // Somebody took the time while they were typing: show what is left.
      if (statusOf(err) === 409) {
        setStart(null);
        void queryClient.invalidateQueries({ queryKey: ['availability'] });
      }
    },
  });

  const slots = useQuery(availability.options({ date, ...SESSION }));
  /** One button per start time, whichever court has it. */
  const starts = slots.data
    ? [...new Set(slots.data.slots.map((s) => s.start))].sort((a, b) => a - b)
    : null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (start === null) return;
    const form = new FormData(e.currentTarget);
    book.mutate({
      name: String(form.get('name') ?? ''),
      phone: String(form.get('phone') ?? ''),
      date,
      start,
    });
  }

  const busy = book.isPending || book.isSuccess;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-6 rounded-[12px] border border-clay/30 bg-clay/10 p-6 md:p-9"
    >
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="pb-3 text-[13px] text-[#5C6159]">Which day suits you?</legend>
        <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 md:-mx-9 md:px-9">
          {days.map((d) => {
            const { dow, day, mon } = fmtDayLabel(d);
            const on = d === date;
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDate(d);
                  setStart(null);
                  book.reset();
                }}
                aria-pressed={on}
                aria-label={fmtLongDay(d)}
                className={`flex w-[62px] shrink-0 flex-col items-center gap-0.5 rounded-[10px] border py-2.5 transition-colors ${
                  on
                    ? 'border-clay bg-clay text-white'
                    : 'border-pine/[0.18] bg-white text-[#13271D] hover:border-clay'
                }`}
              >
                <span className={`text-[11px] font-semibold tracking-[0.08em] ${on ? 'text-white/80' : 'text-[#7E8C84]'}`}>
                  {dow.toUpperCase()}
                </span>
                <span className="font-display text-[22px] leading-[26px]">{day}</span>
                <span className={`text-[11px] ${on ? 'text-white/80' : 'text-[#7E8C84]'}`}>{mon}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {date && (
        <fieldset className="flex min-w-0 flex-col gap-3">
          <legend className="pb-3 text-[13px] text-[#5C6159]">What time? Sessions run an hour.</legend>
          <div className="flex flex-wrap gap-2" aria-live="polite">
            {slots.isError ? (
              <p className="py-2 text-[15px] text-[#9C4225]">Could not load times. Please refresh.</p>
            ) : starts === null ? (
              <p className="py-2 text-[15px] text-[#67716A]">Loading times…</p>
            ) : starts.length === 0 ? (
              <p className="py-2 text-[15px] text-[#67716A]">Nothing free that day. Try another.</p>
            ) : (
              starts.map((t) => {
                const on = t === start;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setStart(t);
                      book.reset();
                    }}
                    aria-pressed={on}
                    className={`w-[86px] rounded-[9px] border py-[11px] text-center text-[16px] font-semibold transition-colors ${
                      on
                        ? 'border-clay bg-clay text-white'
                        : 'border-pine/[0.18] bg-white text-[#13271D] hover:border-clay'
                    }`}
                  >
                    {fmtTime24(t)}
                  </button>
                );
              })
            )}
          </div>
        </fieldset>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-[13px] text-[#5C6159]">Your name</span>
        <input
          name="name"
          required
          autoComplete="name"
          placeholder="Amina Mushi"
          className="rounded-[9px] border border-pine/[0.18] bg-white px-4 py-3 text-[16px] text-[#13271D] outline-none placeholder:text-[#9AA39B] focus:border-clay"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-[13px] text-[#5C6159]">Mobile money number</span>
        <input
          name="phone"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
          className="rounded-[9px] border border-pine/[0.18] bg-white px-4 py-3 text-[16px] text-[#13271D] outline-none placeholder:text-[#9AA39B] focus:border-clay"
        />
        <span className="text-[12.5px] text-[#5C6159]">
          The payment prompt goes here, and so does our WhatsApp confirming your session.
        </span>
      </label>

      {book.isError && (
        <p
          role="alert"
          className="rounded-[9px] border border-clay/40 bg-white px-4 py-3 text-[14px] text-[#9C4225]"
        >
          {book.error instanceof Error ? book.error.message : 'Something went wrong. Try again.'}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !date || start === null}
        className="rounded-full bg-clay px-[38px] py-4 text-[16px] font-semibold text-white transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 sm:self-start"
      >
        {busy
          ? 'Sending the prompt…'
          : date && start !== null
            ? `Pay TSh ${fee.toLocaleString('en-US')} for ${fmtLongDay(date)}, ${fmtTime24(start)}`
            : date
              ? 'Pick a time above'
              : 'Pick a day above'}
      </button>
    </form>
  );
}
