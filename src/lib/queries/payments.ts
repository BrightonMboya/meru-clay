/**
 * Paying, from the browser's side.
 *
 * Same contract as src/lib/queries/bookings.ts: keys and fetchers together,
 * no server-only imports, relative URLs to the Route Handlers.
 *
 * The one thing worth noting is the polling on `myPayment`. Tanzanian mobile
 * money is authorised on the payer's handset and confirmed by a webhook that
 * lands whenever it lands, quite possibly after the browser is already
 * sitting on /pay. So the page asks again every few seconds while anything
 * is still in flight, and stops as soon as it is not. That holds for any
 * provider the club picks.
 *
 * The write is `startPayment`, at the bottom. The club is on Snippe, which
 * is a direct-charge provider: the payer gives us a number and a USSD
 * prompt goes to that handset, rather than being sent off to a hosted page.
 * So the write takes a phone number and returns nothing to navigate to —
 * the polling above is what carries the page from there.
 */

import { queryOptions } from '@tanstack/react-query';
import type { PaymentStatus } from '@/lib/checkout';
import { getJson } from './http';

export type PaymentView = {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  purpose: 'booking' | 'membership' | 'class';
  title: string;
  detail: string;
  name: string;
  /** The number on file, prefilled into the pay form. May be ''. */
  phone: string;
  /** Paid AND delivered. The only state that needs nothing further. */
  done: boolean;
  /** Paid, but the club has to sort something out. Somebody will call. */
  needsClub: boolean;
  /** Sent to the provider, no answer. The club is checking; do not re-pay. */
  checking: boolean;
  /** Still in flight, so keep asking. */
  pending: boolean;
  reference: string;
  bookingId: string | null;
};

export const myPayment = {
  key: (id: string) => ['payment', id] as const,

  options: (id: string) =>
    queryOptions({
      queryKey: myPayment.key(id),
      queryFn: ({ signal }) => getJson<PaymentView>(`/api/payments/${id}`, { signal }),
      // Four seconds while a mobile-money push is out; stop once it lands.
      // `refetchInterval` takes a function so the decision is made against
      // the freshest answer rather than the one this was set up with.
      refetchInterval: (query) => (query.state.data?.pending ? 4_000 : false),
    }),
};

/**
 * Send a mobile money prompt to a handset.
 *
 * A refusal comes back with wording already fit to show the payer — "that
 * does not look like a Tanzanian mobile number", "mobile money is busy" —
 * so the panel renders `error` verbatim rather than inventing its own. See
 * the note in `getJson` about why the wording survives the trip.
 *
 * 409 means somebody already started one: a second tap on the button, or a
 * payment that is already settled. Not an error worth shouting about, and
 * the poll will catch up on its own.
 */
export function startPayment(id: string, phone: string) {
  return getJson<{ ok: true; status: PaymentStatus; message: string }>(
    `/api/payments/${id}/pay`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    },
  );
}
