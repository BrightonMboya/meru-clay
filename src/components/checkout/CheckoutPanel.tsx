'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { myPayment, startPayment, type PaymentView } from '@/lib/queries/payments';

/**
 * One payment, as the payer sees it.
 *
 * Reached from a link the club sent. The id in the URL is a v4 UUID that
 * appears nowhere else, so holding it is the authorisation — there are no
 * player accounts, and making somebody create one to pay a club
 * subscription would be worse than the problem.
 *
 * ── Why there is a phone number field ────────────────────────────────────
 * The club is on Snippe, which is a direct-charge provider: there is no
 * hosted page to send anybody to. The payer types the number they want to
 * pay from, a USSD prompt goes to that handset, and they approve it with
 * their mobile money PIN without ever leaving this page. That is the right
 * shape for the audience — most arrive from a WhatsApp link on a phone with
 * a patchy connection, and a redirect to a third-party checkout is one more
 * page that can fail to load.
 *
 * The number is asked for rather than assumed, even though the club usually
 * has one on file. A member frequently pays from a different line to the
 * one the club rings them on — a spouse's, a business float — and
 * pre-filling a number that quietly charges the wrong handset is worse than
 * asking. The one on file is offered as the default and can be changed.
 *
 * ── Why the wait is a poll and not a promise ─────────────────────────────
 * The charge request comes back as soon as the prompt is sent, which is
 * long before anybody has found their PIN. What actually settles the
 * payment is Snippe's webhook, landing on the server whenever it lands. So
 * the button's job ends at "prompt sent", and `myPayment` polling every
 * four seconds is what carries the page to "paid".
 */
export default function CheckoutPanel({ id }: { id: string }) {
  const query = useQuery(myPayment.options(id));
  const payment = query.data;

  if (query.isPending) {
    return <p className="py-6 text-[16px] text-[#5C6159]">Looking up your payment…</p>;
  }

  if (query.isError || !payment) {
    return (
      <Card tone="quiet">
        <p className="font-display text-[26px] leading-[32px] text-[#13271D]">
          We cannot find that payment.
        </p>
        <p className="text-[15px] leading-[25px] text-[#3C3F38]">
          The link may be mistyped, or it may have expired. WhatsApp us and we will sort it out.
        </p>
        <a href={whatsapp} target="_blank" rel="noopener" className={primary}>
          WhatsApp the club
        </a>
      </Card>
    );
  }

  const money = `TSh ${payment.amount.toLocaleString('en-US')}`;

  /* Paid, and the club has done its half. Nothing left to do. */
  if (payment.done) {
    return (
      <Card tone="loud">
        <Eyebrow>PAID</Eyebrow>
        <p className="font-display text-[30px] leading-[36px] text-[#13271D]">{payment.title}</p>
        <p className="text-[15px] text-[#3C3F38]">{payment.detail}</p>
        <Receipt payment={payment} money={money} />
        <p className="border-t border-clay/25 pt-6 text-[15px] leading-[25px] text-[#3C3F38]">
          {payment.purpose === 'booking'
            ? 'Your court is confirmed. Just turn up.'
            : 'Your membership is up to date. Thank you.'}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {payment.bookingId && (
            <Link href={`/book/${payment.bookingId}`} className={primary}>
              View your booking
            </Link>
          )}
          <Link href="/book" className={payment.bookingId ? secondary : primary}>
            Book a court
          </Link>
        </div>
      </Card>
    );
  }

  /*
    Paid, and something at the club's end is outstanding. The money is safe
    and a person has already been alerted; what this must not do is imply
    the payment failed, because it did not.
  */
  if (payment.needsClub) {
    return (
      <Card tone="loud">
        <Eyebrow>PAID — WE ARE SORTING SOMETHING OUT</Eyebrow>
        <p className="font-display text-[30px] leading-[36px] text-[#13271D]">{payment.title}</p>
        <Receipt payment={payment} money={money} />
        <p className="border-t border-clay/25 pt-6 text-[15px] leading-[25px] text-[#3C3F38]">
          Your payment of <strong>{money}</strong> came through. Something changed at our end
          before it landed, so somebody from the club will call you today to put it right.
          Nothing more is needed from you.
        </p>
        <a href={whatsapp} target="_blank" rel="noopener" className={primary}>
          WhatsApp the club
        </a>
      </Card>
    );
  }

  /* Nothing left to pay against. A dead link. */
  if (payment.status === 'abandoned' || payment.status === 'refunded') {
    return (
      <Card tone="quiet">
        <Eyebrow>{payment.status === 'refunded' ? 'REFUNDED' : 'EXPIRED'}</Eyebrow>
        <p className="font-display text-[26px] leading-[32px] text-[#13271D]">{payment.title}</p>
        <p className="text-[15px] leading-[25px] text-[#3C3F38]">
          {payment.status === 'refunded'
            ? 'This payment was refunded.'
            : 'This link has expired. WhatsApp us and we will send a new one.'}
        </p>
        <a href={whatsapp} target="_blank" rel="noopener" className={primary}>
          WhatsApp the club
        </a>
      </Card>
    );
  }

  /* The main case: here is what you owe, and here is how to settle it. */
  return (
    <Card tone="loud">
      <Eyebrow>TO PAY</Eyebrow>
      <p className="font-display text-[30px] leading-[36px] text-[#13271D]">{payment.title}</p>
      <div className="flex flex-col gap-1.5">
        {payment.detail && <p className="text-[15px] text-[#3C3F38]">{payment.detail}</p>}
        <p className="font-display text-[34px] leading-[38px] text-clay">{money}</p>
      </div>

      <PayByPhone id={id} payment={payment} />

      <div className="flex flex-col gap-3 border-t border-clay/25 pt-6">
        <p className="text-[15px] leading-[25px] text-[#3C3F38]">
          Rather pay at the court? Cash and mobile money are both fine — quote reference{' '}
          <span className="font-mono text-[#13271D]">{payment.reference}</span>.
        </p>
        <a href={whatsapp} target="_blank" rel="noopener" className={secondary}>
          WhatsApp the club
        </a>
      </div>
    </Card>
  );
}

/**
 * The number, the button, and the wait.
 *
 * Four states and they are all the same card, because a payer watching a
 * prompt arrive should not have the page rearrange itself underneath them:
 * the form is replaced in place by the instruction to check their phone.
 *
 * `processing` is read from the payment rather than from the mutation, so
 * somebody who sends a prompt, closes the tab and comes back still sees
 * "check your phone" instead of a button that would send a second one.
 */
function PayByPhone({ id, payment }: { id: string; payment: PaymentView }) {
  const client = useQueryClient();
  const [phone, setPhone] = useState(payment.phone ?? '');
  const owed = `TSh ${payment.amount.toLocaleString('en-US')}`;

  const pay = useMutation({
    mutationFn: () => startPayment(id, phone),
    onSuccess: () => client.invalidateQueries({ queryKey: myPayment.key(id) }),
  });

  /*
    We asked for the charge and got no answer back, so we genuinely do not
    know whether a prompt reached them or money moved. Telling them to check
    their phone would be a guess, and offering the button again would risk
    charging them twice — so this says what is true and stops.
  */
  if (payment.checking) {
    return (
      <div className="flex flex-col gap-2 border-t border-clay/25 pt-6">
        <p className="text-[15px] font-semibold leading-[25px] text-[#13271D]">
          We are checking that payment.
        </p>
        <p className="text-[15px] leading-[25px] text-[#3C3F38]">
          Something went wrong between us and mobile money, so we cannot tell yet whether it went
          through. <strong>Please do not pay again.</strong> Somebody from the club will check and
          be in touch today.
        </p>
      </div>
    );
  }

  if (payment.status === 'processing') {
    return (
      <div className="flex flex-col gap-2 border-t border-clay/25 pt-6">
        <p className="text-[15px] font-semibold leading-[25px] text-[#13271D]">
          Check your phone.
        </p>
        <p className="text-[15px] leading-[25px] text-[#3C3F38]">
          A payment request is on its way to the number you gave. Enter your mobile money PIN to
          approve it — this page will update by itself once it goes through.
        </p>
      </div>
    );
  }

  const declined = payment.status === 'failed';

  return (
    <form
      className="flex flex-col gap-3 border-t border-clay/25 pt-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pay.isPending) pay.mutate();
      }}
    >
      {declined && !pay.isError && (
        <p className="text-[15px] leading-[25px] text-[#8A3324]">
          That last request was not approved. You can try again, on this number or another one.
        </p>
      )}

      <label htmlFor="msisdn" className="text-[15px] leading-[25px] text-[#3C3F38]">
        Pay by mobile money — M-Pesa, Airtel Money, Mixx by Yas or Halotel.
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <input
          id="msisdn"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="0712 345 678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={pay.isPending}
          className="min-w-[200px] flex-1 rounded-full border border-pine/25 bg-white px-[22px] py-[11px] text-[15px] text-[#13271D] placeholder:text-[#9AA39C] focus:border-clay focus:outline-none disabled:opacity-60"
        />
        <button type="submit" disabled={pay.isPending} className={`${primary} disabled:opacity-60`}>
          {pay.isPending ? 'Sending…' : `Pay ${owed}`}
        </button>
      </div>

      {pay.isError && (
        <p className="text-[15px] leading-[25px] text-[#8A3324]">
          {(pay.error as Error).message}
        </p>
      )}
    </form>
  );
}

const whatsapp = 'https://wa.me/255782628288';

const primary =
  'self-start rounded-full bg-clay px-[26px] py-[11px] text-[15px] font-semibold text-white transition-transform hover:scale-[1.03]';

const secondary =
  'self-start rounded-full border border-pine/25 px-[26px] py-[11px] text-[15px] text-[#13271D] transition-colors hover:bg-pine/5';

function Card({ tone, children }: { tone: 'loud' | 'quiet'; children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-col gap-6 rounded-[12px] border p-7 md:p-9 ${
        tone === 'loud' ? 'border-clay/30 bg-clay/10' : 'border-pine/[0.18] bg-white'
      }`}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="text-[12px] font-bold tracking-[0.18em] text-clay">{children}</span>;
}

/** What it was and what it cost, after paying. */
function Receipt({ payment, money }: { payment: { reference: string }; money: string }) {
  return (
    <p className="text-[14px] text-[#5C6159]">
      {money} · Reference <span className="font-mono text-[#13271D]">{payment.reference}</span>
    </p>
  );
}
