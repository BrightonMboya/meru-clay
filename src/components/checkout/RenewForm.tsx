'use client';

import { useMutation } from '@tanstack/react-query';
import { getJson } from '@/lib/queries/http';

/**
 * "Send me my renewal link."
 *
 * Deliberately the smallest form on the site: one field, one button, one
 * answer. There is no membership status to show and there cannot be — the
 * route behind it tells nobody whether a number is a member, for the reasons
 * set out in src/app/api/renew/route.ts — so this reflects that honestly
 * instead of pretending to look something up.
 *
 * Success wording is therefore conditional ("if that number is a member"),
 * which reads slightly awkwardly to the member who knows perfectly well that
 * they are one. That is the right trade: the alternative hands anybody a way
 * to test numbers against the club's roster.
 */
export default function RenewForm() {
  const ask = useMutation({
    mutationFn: (phone: string) =>
      getJson<{ ok: true; message: string }>('/api/renew', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      }),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const phone = String(new FormData(e.currentTarget).get('phone') ?? '');
    ask.mutate(phone);
  }

  if (ask.isSuccess) {
    return (
      <div className="flex flex-col gap-5 rounded-[12px] border border-clay/30 bg-clay/10 p-7 md:p-9">
        <span className="text-[12px] font-bold tracking-[0.18em] text-clay">CHECK YOUR WHATSAPP</span>
        <p className="text-[16px] leading-[26px] text-[#3C3F38]">{ask.data.message}</p>
        <p className="text-[15px] leading-[25px] text-[#5F6B62]">
          Nothing arrived after a minute or two? It may be that your subscription is not due yet,
          or that we have a different number on file.{' '}
          <a
            href="https://wa.me/255782628288"
            target="_blank"
            rel="noopener"
            className="text-clay underline underline-offset-4"
          >
            Message us
          </a>{' '}
          and we will sort it out.
        </p>
        <button
          type="button"
          onClick={() => ask.reset()}
          className="self-start rounded-full border border-pine/25 px-[26px] py-[11px] text-[15px] text-[#13271D] transition-colors hover:bg-pine/5"
        >
          Try another number
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-[12px] border border-pine/[0.18] bg-white p-7 md:p-9"
    >
      <label className="flex flex-col gap-2">
        <span className="text-[13px] text-[#5C6159]">The number you are a member on</span>
        <input
          name="phone"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="0782 628 288"
          className="rounded-[9px] border border-pine/[0.18] bg-white px-4 py-3 text-[16px] text-[#13271D] outline-none placeholder:text-[#9AA39B] focus:border-clay"
        />
      </label>

      {ask.isError && (
        <p
          role="alert"
          className="rounded-[9px] border border-clay/40 bg-clay/10 px-4 py-3 text-[14px] text-[#9C4225]"
        >
          {ask.error instanceof Error ? ask.error.message : 'Something went wrong. Try again.'}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={ask.isPending}
          className="self-start rounded-full bg-clay px-[38px] py-4 text-[16px] font-semibold text-white transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {ask.isPending ? 'Sending…' : 'Send me a payment link'}
        </button>
        <span className="text-[12.5px] text-[#5C6159]">
          The link goes to the number we have on file, not to the one you type.
        </span>
      </div>
    </form>
  );
}
