'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  addMonths,
  fmtMonthYear,
  isSameMonth,
  monthGrid,
  nowLocal,
} from '@/lib/time';

/**
 * The day control in a screen's head: an arrow at each end and the date
 * between them, which opens a calendar.
 *
 * Stepping a day at a time is the common move and stays one click. Jumping to
 * next Saturday is not, and walking the arrows there is five clicks and a
 * refetch each — hence the calendar behind the label.
 *
 * The row is a fixed 292px with the arrows pinned to its ends, so stepping
 * through the week never wraps the date onto a second line or shuffles the
 * arrows sideways as its length changes. The calendar is 42 cells in every
 * month for the same reason: opening it in February must not move what is
 * underneath it.
 */
export default function DayNav({
  label,
  date,
  onPrev,
  onNext,
  onPick,
}: {
  /** The date as the screen wants it written — "Friday 19 Sep". */
  label: string;
  /** The day being shown, as an ISO date. Only needed for the calendar. */
  date?: string;
  onPrev?: () => void;
  onNext?: () => void;
  /** Omitted on screens where the day is only ever stepped. */
  onPick?: (isoDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const calendarId = useId();

  const pickable = Boolean(date && onPick);

  // Clicking anywhere else, or pressing Escape, puts the calendar away.
  // Escape hands focus back to the label so the keyboard does not end up
  // stranded at the top of the document.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={wrap}
      className="relative flex w-[292px] max-w-full shrink-0 items-center justify-between gap-3"
    >
      <Stepper direction="prev" onClick={onPrev} />

      {pickable ? (
        <button
          ref={trigger}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? calendarId : undefined}
          className={`flex min-w-0 grow items-center justify-center gap-[7px] whitespace-nowrap rounded-[9px] px-2 py-1 text-[20px] font-medium leading-6 text-pine transition-colors hover:bg-neutral-50 ${
            open ? 'bg-neutral-50' : ''
          }`}
        >
          <span className="truncate">{label}</span>
          <svg
            width="11"
            height="11"
            viewBox="0 0 12 12"
            className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            <path
              d="M2.8 4.4 6 7.6l3.2-3.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : (
        <span className="min-w-0 grow whitespace-nowrap text-center text-[20px] font-medium leading-6 text-pine">
          {label}
        </span>
      )}

      <Stepper direction="next" onClick={onNext} />

      {open && date && onPick && (
        <Calendar
          id={calendarId}
          date={date}
          onPick={(iso) => {
            setOpen(false);
            if (iso !== date) onPick(iso);
          }}
        />
      )}
    </div>
  );
}

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** The month behind the label. Opens on the month of the day being shown. */
function Calendar({
  id,
  date,
  onPick,
}: {
  id: string;
  date: string;
  onPick: (isoDate: string) => void;
}) {
  // Which month is on screen, which is not the same question as which day is
  // chosen — paging to November and closing again must not change the day.
  const [month, setMonth] = useState(date);
  const today = nowLocal().date;

  return (
    <div
      id={id}
      role="dialog"
      aria-label="Pick a day"
      className="absolute left-1/2 top-[calc(100%+8px)] z-30 w-[290px] -translate-x-1/2 rounded-xl border border-neutral-200 bg-white p-3 shadow-[0_12px_32px_rgba(19,39,29,0.12)]"
    >
      <div className="flex items-center justify-between gap-2 pb-2">
        <Stepper
          direction="prev"
          size={28}
          label="Previous month"
          onClick={() => setMonth((m) => addMonths(m, -1))}
        />
        <span className="text-[14px] font-semibold leading-5 text-pine">
          {fmtMonthYear(month)}
        </span>
        <Stepper
          direction="next"
          size={28}
          label="Next month"
          onClick={() => setMonth((m) => addMonths(m, 1))}
        />
      </div>

      <div className="grid grid-cols-7 pb-1">
        {DOW.map((letter, i) => (
          <span
            key={i}
            aria-hidden
            className="text-center text-[10px] font-bold leading-4 tracking-[0.1em] text-neutral-400"
          >
            {letter}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {monthGrid(month).map((iso) => {
          const chosen = iso === date;
          const outside = !isSameMonth(iso, month);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              aria-current={chosen ? 'date' : undefined}
              className={[
                'mx-auto flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-[13px] leading-4 transition-colors',
                chosen
                  ? 'bg-pine font-semibold text-cream'
                  : iso === today
                    ? 'font-semibold text-clay ring-1 ring-inset ring-clay/40 hover:bg-clay/[0.07]'
                    : outside
                      ? 'font-normal text-neutral-300 hover:bg-neutral-50'
                      : 'font-medium text-pine hover:bg-neutral-100',
              ].join(' ')}
            >
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onPick(today)}
        className="mt-2 w-full rounded-[9px] border border-neutral-200 py-[7px] text-[12px] font-medium leading-4 text-pine transition-colors hover:bg-neutral-50"
      >
        Today
      </button>
    </div>
  );
}

function Stepper({
  direction,
  onClick,
  size = 34,
  label,
}: {
  direction: 'prev' | 'next';
  onClick?: () => void;
  size?: number;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label ?? (direction === 'prev' ? 'Previous day' : 'Next day')}
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-[9px] border border-pine/[0.18] transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden>
        <path
          d={direction === 'prev' ? 'M6 1L1 6L6 11' : 'M1 1L6 6L1 11'}
          stroke="#3C3F38"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
