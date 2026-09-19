'use client';

import { useState } from 'react';
import {
  Btn,
  Chip,
  FormError,
  INPUT,
  PANEL,
  PANEL_LABEL,
  SELECT,
  errorText,
} from '@/components/admin/ui';
import { COURTS } from '@/lib/availability';
import type { Arrival, Entry } from '@/lib/admin/desk';
import { CLOSE_MIN, DURATIONS, OPEN_MIN, STEP_MIN, fmtTime24 } from '@/lib/time';

/** Every half hour the club is open — the grid both forms pick from. */
const STEPS = Array.from(
  { length: (CLOSE_MIN - OPEN_MIN) / STEP_MIN + 1 },
  (_, i) => OPEN_MIN + i * STEP_MIN,
);

/**
 * Close a court.
 *
 * Writes a row to `blocks`, which the availability engine already reads — so
 * the closed hours disappear from /book as soon as this saves, which is what
 * the copy beside the button has always promised.
 */
export function CloseCourtForm({
  date,
  onClose,
  onSubmit,
  busy,
  error,
}: {
  date: string;
  onClose: () => void;
  onSubmit: (v: { court: number | null; start: number; end: number; reason: string }) => void;
  busy: boolean;
  error: unknown;
}) {
  const [court, setCourt] = useState<number | null>(null);
  const [start, setStart] = useState(OPEN_MIN);
  const [end, setEnd] = useState(OPEN_MIN + 120);
  const [reason, setReason] = useState('');

  const bad = end <= start;

  return (
    <section className={PANEL} aria-label="Close a court">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className={PANEL_LABEL}>CLOSE A COURT</h2>
        <span className="text-[13px] text-neutral-500">{date}</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-neutral-600">Which court</span>
        <div className="flex flex-wrap gap-2">
          <Chip on={court === null} chosen="ring" onClick={() => setCourt(null)}>
            Both courts
          </Chip>
          {COURTS.map((c) => (
            <Chip key={c.id} on={court === c.id} chosen="ring" onClick={() => setCourt(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-neutral-600">From</span>
          <select
            className={SELECT}
            value={start}
            onChange={(e) => {
              const v = Number(e.target.value);
              setStart(v);
              // Keep the window valid rather than letting it invert.
              if (v >= end) setEnd(Math.min(CLOSE_MIN, v + STEP_MIN));
            }}
          >
            {STEPS.filter((m) => m < CLOSE_MIN).map((m) => (
              <option key={m} value={m}>
                {fmtTime24(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-neutral-600">Until</span>
          <select className={SELECT} value={end} onChange={(e) => setEnd(Number(e.target.value))}>
            {STEPS.filter((m) => m > start).map((m) => (
              <option key={m} value={m}>
                {fmtTime24(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[180px] grow flex-col gap-1.5">
          <span className="text-[13px] text-neutral-600">Reason</span>
          <input
            className={INPUT}
            value={reason}
            maxLength={80}
            placeholder="Rain · resurfacing · tournament"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </div>

      {error ? <FormError>{errorText(error, 'Could not close the court.')}</FormError> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Btn
          variant="primary"
          disabled={busy || bad}
          onClick={() => onSubmit({ court, start, end, reason })}
        >
          {busy ? 'Closing…' : 'Close the court'}
        </Btn>
        <Btn variant="quiet" onClick={onClose}>
          Cancel
        </Btn>
        <span className="text-[13px] text-neutral-500">
          Bookings already taken in that window are kept — phone those players.
        </span>
      </div>
    </section>
  );
}

/**
 * Add a booking taken at the counter or over the phone.
 *
 * Goes in confirmed and unheld: the player is standing there, so there is
 * nothing for the coach to confirm later. The clash check is the same one
 * /book runs, so the desk cannot double-book either.
 */
export function AddBookingForm({
  date,
  defaults,
  onClose,
  onSubmit,
  busy,
  error,
}: {
  date: string;
  /** What to open the form holding — a refused booking, handed back to be retried. */
  defaults?: Partial<{
    court: number;
    start: number;
    duration: number;
    name: string;
    phone: string;
    coach: boolean;
    paid: boolean;
  }>;
  onClose: () => void;
  onSubmit: (v: {
    court: number;
    start: number;
    duration: number;
    name: string;
    phone: string;
    coach: boolean;
    paid: boolean;
  }) => void;
  busy: boolean;
  error: unknown;
}) {
  const [court, setCourt] = useState(defaults?.court ?? COURTS[0].id);
  const [start, setStart] = useState(defaults?.start ?? OPEN_MIN);
  const [duration, setDuration] = useState<number>(defaults?.duration ?? DURATIONS[0]);
  const [name, setName] = useState(defaults?.name ?? '');
  const [phone, setPhone] = useState(defaults?.phone ?? '');
  const [coach, setCoach] = useState(defaults?.coach ?? false);
  const [paid, setPaid] = useState(defaults?.paid ?? true);

  return (
    <section className={PANEL} aria-label="Add a booking">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className={PANEL_LABEL}>ADD A BOOKING</h2>
        <span className="text-[13px] text-neutral-500">{date}</span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[170px] grow flex-col gap-1.5">
          <span className="text-[13px] text-neutral-600">Name</span>
          <input
            className={INPUT}
            value={name}
            maxLength={80}
            placeholder="Asha Mollel"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex min-w-[150px] grow flex-col gap-1.5">
          <span className="text-[13px] text-neutral-600">
            Phone <span className="text-neutral-400">optional</span>
          </span>
          <input
            className={INPUT}
            value={phone}
            inputMode="tel"
            placeholder="0782 628 288"
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-neutral-600">Court</span>
          <select
            className={SELECT}
            value={court}
            onChange={(e) => setCourt(Number(e.target.value))}
          >
            {COURTS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-neutral-600">Start</span>
          <select className={SELECT} value={start} onChange={(e) => setStart(Number(e.target.value))}>
            {STEPS.filter((m) => m < CLOSE_MIN).map((m) => (
              <option key={m} value={m}>
                {fmtTime24(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-neutral-600">Length</span>
          <select
            className={SELECT}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d === 60 ? '1 hour' : '1.5 hours'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip on={coach} chosen="ring" onClick={() => setCoach(!coach)}>
          With a coach
        </Chip>
        <Chip on={paid} chosen="ring" onClick={() => setPaid(!paid)}>
          Paid
        </Chip>
      </div>

      {error ? <FormError>{errorText(error, 'Could not save the booking.')}</FormError> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Btn
          variant="primary"
          disabled={busy || name.trim().length < 2}
          onClick={() =>
            onSubmit({ court, start, duration, name: name.trim(), phone: phone.trim(), coach, paid })
          }
        >
          {busy ? 'Saving…' : 'Save the booking'}
        </Btn>
        <Btn variant="quiet" onClick={onClose}>
          Cancel
        </Btn>
      </div>
    </section>
  );
}

export type Selected =
  | { kind: 'booking'; id: string; title: string; detail: string; holding: boolean; paid: boolean; phone: string }
  | { kind: 'closure'; id: number; title: string; detail: string };

/** Turn a clicked timeline block into something the sheet can render. */
export function fromEntry(entry: Entry, arrivals: Arrival[]): Selected | null {
  if (entry.kind === 'closed' && entry.blockId !== undefined) {
    return { kind: 'closure', id: entry.blockId, title: entry.title, detail: entry.detail };
  }
  if (entry.bookingId) {
    const arrival = arrivals.find((a) => a.bookingId === entry.bookingId);
    return {
      kind: 'booking',
      id: entry.bookingId,
      title: entry.title,
      detail: entry.detail,
      holding: entry.kind === 'hold',
      paid: !entry.owing,
      phone: arrival?.phone ?? '',
    };
  }
  return null;
}

export function fromArrival(a: Arrival): Selected {
  return {
    kind: 'booking',
    id: a.bookingId,
    title: a.name,
    detail: a.detail,
    holding: a.holding,
    paid: a.paid,
    phone: a.phone,
  };
}

/**
 * What the desk can do to the thing it just clicked.
 *
 * One panel for both bookings and closures, because from the operator's side
 * they are the same gesture — "I clicked that block, now what?" — and the
 * answers differ only in which buttons appear.
 */
export function ActionSheet({
  selected,
  onAct,
  onReopen,
  onClose,
  busy,
  error,
}: {
  selected: Selected;
  onAct: (action: 'confirm' | 'cancel' | 'paid' | 'unpaid') => void;
  onReopen: () => void;
  onClose: () => void;
  busy: boolean;
  error: unknown;
}) {
  const digits = selected.kind === 'booking' ? selected.phone.replace(/\D/g, '') : '';

  return (
    <section className={PANEL} aria-label="Booking actions">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[18px] font-medium leading-6 text-pine">{selected.title}</span>
          <span className="text-[13px] leading-[18px] text-neutral-600">{selected.detail}</span>
        </div>
        <Btn variant="quiet" size="sm" onClick={onClose}>
          Close
        </Btn>
      </div>

      {error ? <FormError>{errorText(error, 'That did not go through.')}</FormError> : null}

      <div className="flex flex-wrap gap-2">
        {selected.kind === 'closure' ? (
          <Btn variant="primary" disabled={busy} onClick={onReopen}>
            {busy ? 'Reopening…' : 'Reopen this court'}
          </Btn>
        ) : (
          <>
            {selected.holding && (
              <Btn variant="primary" disabled={busy} onClick={() => onAct('confirm')}>
                Confirm
              </Btn>
            )}
            {!selected.holding && (
              <Btn disabled={busy} onClick={() => onAct(selected.paid ? 'unpaid' : 'paid')}>
                {selected.paid ? 'Mark unpaid' : 'Mark paid'}
              </Btn>
            )}
            {digits && (
              <>
                <Btn href={`tel:+${digits}`}>Call</Btn>
                <Btn href={`https://wa.me/${digits}`}>WhatsApp</Btn>
              </>
            )}
            <Btn disabled={busy} onClick={() => onAct('cancel')}>
              {selected.holding ? 'Release' : 'Cancel booking'}
            </Btn>
          </>
        )}
      </div>
    </section>
  );
}
