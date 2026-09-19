'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cancelMyBooking, myBooking } from '@/lib/queries/bookings';

/** Milliseconds left -> "6:12". Never counts below zero. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * A ticking clock, started only on the client.
 *
 * Rendering a countdown during SSR would guarantee a hydration mismatch — the
 * server's "9:58" is already wrong by the time the browser reads it — so this
 * returns null until the first tick and every caller treats that as "not
 * counting yet".
 */
function useNow(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  return active ? now : null;
}

const card = 'flex flex-col gap-6 rounded-[12px] border p-7 md:p-9';

/**
 * A player's own booking: what they have, how long the hold has left, and the
 * one thing they might want to do about it.
 *
 * Reached from the confirmation panel. The id in the URL is a v4 UUID that
 * appears nowhere else, so holding the link is the authorisation — there is
 * no account to log into and asking a player to make one to cancel a court
 * would be worse than the problem.
 */
export default function BookingStatus({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const query = useQuery(myBooking.options(id));
  const booking = query.data;

  const holding = booking?.status === 'held' && booking.expiresAt !== null;
  const now = useNow(Boolean(holding));
  const left = holding && now !== null ? booking!.expiresAt! - now : null;
  const lapsed = left !== null && left <= 0;

  const release = useMutation({
    mutationFn: () => cancelMyBooking(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: myBooking.key(id) });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });

  if (query.isPending) {
    return <p className="py-6 text-[16px] text-[#5C6159]">Looking up your booking…</p>;
  }

  if (query.isError || !booking) {
    return (
      <div className={`${card} border-pine/[0.18] bg-white`}>
        <p className="font-display text-[26px] leading-[32px] text-[#13271D]">
          We cannot find that booking.
        </p>
        <p className="text-[15px] leading-[25px] text-[#3C3F38]">
          The link may be mistyped, or the booking may have been cancelled.
        </p>
        <Link
          href="/book"
          className="self-start rounded-full bg-clay px-[26px] py-3 text-[15px] font-semibold text-white"
        >
          Book a court
        </Link>
      </div>
    );
  }

  const cancelled = booking.status === 'cancelled';
  const dead = cancelled || lapsed;

  const heading = cancelled
    ? 'CANCELLED'
    : lapsed
      ? 'HOLD EXPIRED'
      : booking.status === 'confirmed'
        ? 'CONFIRMED'
        : 'COURT HELD';

  return (
    <div
      className={`${card} ${
        dead ? 'border-pine/[0.18] bg-white' : 'border-clay/30 bg-clay/10'
      }`}
    >
      <div className="flex flex-col gap-2.5">
        <span
          className={`text-[12px] font-bold tracking-[0.18em] ${
            dead ? 'text-[#67716A]' : 'text-clay'
          }`}
        >
          {heading}
        </span>
        <p className="font-display text-[30px] leading-[36px] text-[#13271D]">
          {booking.when} · {booking.courtName}
        </p>
        <p className="text-[15px] text-[#3C3F38]">{booking.day}</p>
        <p className="text-[14px] text-[#5C6159]">
          Reference <span className="font-mono text-[#13271D]">{booking.reference}</span>
          {booking.coach && ' · with a coach'}
          {booking.amount > 0 && ` · TSh ${booking.amount.toLocaleString('en-US')}`}
          {booking.paid && ' · paid'}
        </p>
      </div>

      {/* The hold, counting down for real rather than as a printed promise. */}
      {holding && !lapsed && (
        <div className="flex flex-col gap-1.5 border-t border-clay/25 pt-6">
          <span className="font-display text-[34px] leading-[38px] text-clay">
            {left === null ? '—' : countdown(left)}
          </span>
          <span className="text-[14px] leading-[22px] text-[#3C3F38]">
            left on your hold. The coach has been messaged and will confirm with you directly.
          </span>
        </div>
      )}

      {lapsed && (
        <p className="border-t border-pine/[0.14] pt-6 text-[15px] leading-[25px] text-[#3C3F38]">
          Nobody confirmed this in time, so the slot has gone back on sale. Booking again takes a
          few seconds.
        </p>
      )}

      {cancelled && (
        <p className="border-t border-pine/[0.14] pt-6 text-[15px] leading-[25px] text-[#3C3F38]">
          This booking was cancelled. The court is free for somebody else.
        </p>
      )}

      {booking.status === 'confirmed' && (
        <p className="border-t border-clay/25 pt-6 text-[15px] leading-[25px] text-[#3C3F38]">
          {booking.paid
            ? 'Paid in full. Just turn up.'
            : 'Pay at the court, in cash or on mobile money.'}
        </p>
      )}

      {release.isError && (
        <p role="alert" className="text-[14px] text-[#9C4225]">
          {release.error instanceof Error
            ? release.error.message
            : 'Could not cancel. Please try again.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!dead && (
          <button
            type="button"
            disabled={release.isPending}
            onClick={() => release.mutate()}
            className="rounded-full border border-pine/25 px-[26px] py-[11px] text-[15px] text-[#13271D] transition-colors hover:bg-pine/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {release.isPending ? 'Cancelling…' : 'Cancel this booking'}
          </button>
        )}
        <Link
          href="/book"
          className="rounded-full bg-clay px-[26px] py-[11px] text-[15px] font-semibold text-white transition-transform hover:scale-[1.03]"
        >
          {dead ? 'Book a court' : 'Book another'}
        </Link>
      </div>
    </div>
  );
}
