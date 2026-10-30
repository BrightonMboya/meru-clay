'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { captureOnce } from '@/lib/analytics';
import { trackOnce } from '@/lib/pixel';
import { availability } from '@/lib/queries/bookings';
import {
  CHILD_AGES,
  TRIAL_LEVELS,
  TRIAL_LEVEL_LABELS,
  type TrialLevel,
  type TrialPlayer,
} from '@/lib/pipeline';
import { getJson, statusOf } from '@/lib/queries/http';
import { fmtDayLabel, fmtLongDay, fmtTime24 } from '@/lib/time';

/** The ad's own tags, carried onto the lead so the board can say which ad paid. */
const TRACKED = ['utm_source', 'utm_campaign', 'fbclid'] as const;

/**
 * A trial is an hour — see TRIAL_MINUTES in src/lib/trial.ts. Asked as a
 * court-only hour: the coach is always there for a trial, so only the courts
 * decide which times are free.
 */
const SESSION = { duration: 60, coach: false } as const;

const AGES = Array.from(
  { length: CHILD_AGES.max - CHILD_AGES.min + 1 },
  (_, i) => CHILD_AGES.min + i,
);

const field =
  'rounded-[9px] border border-pine/[0.18] bg-white px-4 py-3 text-[16px] text-[#13271D] outline-none placeholder:text-[#9AA39B] focus:border-clay';

type Booked = { id: number; who: string; date: string; start: number };

/**
 * Who, day and time — and that is it: the trial is free, so there is no
 * payment step to lose people on.
 *
 * Most bookings are a parent booking a child, so that is the default, and it
 * asks for the child's name, age and anything the coach should know. The
 * grown-up's name and WhatsApp number are the lead either way.
 *
 * The times are /book's: the same availability query, so a time offered
 * here is one with a court free. Which court is the club's business, so the
 * courts are folded into one row of start times. `/api/trial` takes the
 * court there and then; on success the form turns into the confirmation,
 * with a way to book a brother or sister.
 */
export default function TrialForm({ days }: { days: string[] }) {
  const [player, setPlayer] = useState<TrialPlayer>('child');
  const [date, setDate] = useState('');
  const [start, setStart] = useState<number | null>(null);
  const [level, setLevel] = useState<TrialLevel>('never');
  const [booked, setBooked] = useState<Booked | null>(null);
  const queryClient = useQueryClient();
  const tags = useRef<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    for (const k of TRACKED) {
      const v = q.get(k);
      if (v) tags.current[k] = v;
    }
  }, []);

  const book = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      getJson<{ ok: true; id: number }>('/api/trial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...input, ...tags.current }),
      }),
    onSuccess: ({ id }, input) => {
      // A Lead the moment a session is booked. Once per trial, so a reload
      // of the same form is not a second lead.
      captureOnce(`trial-${id}`, 'trial_submitted', { player });
      trackOnce(`trial-${id}`, 'Lead', { content_name: 'Free trial session' }, `lead-trial-${id}`);
      setBooked({
        id,
        who: player === 'child' ? String(input.childName) : 'You',
        date,
        start: start!,
      });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
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
    const f = new FormData(e.currentTarget);
    book.mutate({
      player,
      childName: String(f.get('childName') ?? ''),
      childAge: Number(f.get('childAge')),
      name: String(f.get('name') ?? ''),
      phone: String(f.get('phone') ?? ''),
      level,
      notes: String(f.get('notes') ?? ''),
      date,
      start,
    });
  }

  /** Same parent, another child: keep their name and number, clear the rest. */
  function another() {
    setBooked(null);
    setDate('');
    setStart(null);
    setLevel('never');
    book.reset();
    const f = form.current;
    if (!f) return;
    for (const n of ['childName', 'notes']) {
      const el = f.elements.namedItem(n);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = '';
    }
    f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (booked) {
    return (
      <div className="flex flex-col gap-4 rounded-[12px] border border-clay/30 bg-clay/10 p-6 md:p-9" role="status">
        <span className="text-[12px] font-bold tracking-[0.18em] text-clay">YOU ARE BOOKED</span>
        <p className="font-display text-[30px] leading-[1.1] text-[#13271D]">
          {booked.who === 'You' ? 'See you' : `See ${booked.who}`} on {fmtLongDay(booked.date)} at{' '}
          {fmtTime24(booked.start)}.
        </p>
        <p className="text-[15px] leading-[25px] text-[#3C3F38]">
          The session is free and runs an hour with our coach. We will WhatsApp you to confirm.
          Arrive ten minutes early in trainers and comfortable clothes, and bring water.
        </p>
        {player === 'child' && (
          <button
            type="button"
            onClick={another}
            className="self-start rounded-full border border-clay px-6 py-3 text-[15px] font-semibold text-clay transition-colors hover:bg-clay hover:text-white"
          >
            Book another child
          </button>
        )}
      </div>
    );
  }

  const busy = book.isPending;

  return (
    <form
      ref={form}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-6 rounded-[12px] border border-clay/30 bg-clay/10 p-6 md:p-9"
    >
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="pb-3 text-[13px] text-[#5C6159]">Who is the session for?</legend>
        <div className="flex gap-2">
          {(
            [
              ['child', 'My child'],
              ['adult', 'Me'],
            ] as const
          ).map(([v, label]) => (
            <Chip
              key={v}
              on={player === v}
              onClick={() => {
                setPlayer(v);
                book.reset();
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
      </fieldset>

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

      {player === 'child' && (
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-[13px] text-[#5C6159]">Child&apos;s first name</span>
            <input name="childName" required autoComplete="off" placeholder="Neema" className={field} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[13px] text-[#5C6159]">Age</span>
            <select name="childAge" required defaultValue="" className={field}>
              <option value="" disabled>
                –
              </option>
              {AGES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="pb-3 text-[13px] text-[#5C6159]">
          {player === 'child' ? 'Have they played tennis before?' : 'Have you played tennis before?'}
        </legend>
        <div className="flex flex-wrap gap-2">
          {TRIAL_LEVELS.map((l) => (
            <Chip key={l} on={level === l} onClick={() => setLevel(l)}>
              {TRIAL_LEVEL_LABELS[l]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="text-[13px] text-[#5C6159]">
          {player === 'child' ? 'Your name (parent or guardian)' : 'Your name'}
        </span>
        <input name="name" required autoComplete="name" placeholder="Amina Mushi" className={field} />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-[13px] text-[#5C6159]">Your WhatsApp number</span>
        <input
          name="phone"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
          className={field}
        />
        <span className="text-[12.5px] text-[#5C6159]">We will WhatsApp you here to confirm the session.</span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-[13px] text-[#5C6159]">
          Anything the coach should know? <span className="text-[#9AA39B]">Optional</span>
        </span>
        <textarea
          name="notes"
          rows={2}
          maxLength={500}
          placeholder={player === 'child' ? 'Allergies, asthma, a bit shy at first…' : 'Injuries, what you want to work on…'}
          className={`${field} resize-none`}
        />
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
          ? 'Booking…'
          : date && start !== null
            ? `Book free session — ${fmtLongDay(date)}, ${fmtTime24(start)}`
            : date
              ? 'Pick a time above'
              : 'Pick a day above'}
      </button>
    </form>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-[9px] border px-4 py-[11px] text-[15px] font-semibold transition-colors ${
        on ? 'border-clay bg-clay text-white' : 'border-pine/[0.18] bg-white text-[#13271D] hover:border-clay'
      }`}
    >
      {children}
    </button>
  );
}
