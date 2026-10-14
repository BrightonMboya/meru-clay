/**
 * Meta Pixel — the browser half of knowing which ads pay.
 *
 * `fbq` is the global Meta's snippet defines; src/components/MetaPixel.tsx
 * loads it. Everything here is a no-op until it exists, so a visitor with an
 * ad blocker, a page without the pixel, or a deployment with no
 * NEXT_PUBLIC_META_PIXEL_ID set all behave exactly as if tracking were off.
 *
 * The events we send are Meta's standard ones, not custom names, because
 * those are what Ads Manager can optimise a campaign towards:
 *
 *   PageView  — every public page, including client-side navigations
 *   Lead      — the /trial form was submitted and a payment opened
 *   Purchase  — the money arrived and the club confirmed it (/pay shows PAID)
 */

type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[] };

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

export const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '';

/**
 * Send a standard event.
 *
 * `eventID` is what lets Meta recognise the same event twice — from this
 * browser on a reload, or later from our server over the Conversions API —
 * and count it once. Pass a stable id whenever there is one.
 */
export function track(
  event: 'PageView' | 'Lead' | 'InitiateCheckout' | 'Purchase',
  params?: Record<string, unknown>,
  eventID?: string,
): void {
  if (typeof window === 'undefined' || !window.fbq) return;
  if (eventID) window.fbq('track', event, params ?? {}, { eventID });
  else window.fbq('track', event, params ?? {});
}

/**
 * Fire an event at most once per browser for a given key.
 *
 * For Purchase: the /pay page can be reopened from a WhatsApp link a week
 * later and still say PAID, and that must not count as a second sale. Meta
 * deduplicates on `eventID` too, but only over a short window, so this
 * remembers for good. Storage can be unavailable (private mode); then it
 * simply fires and leaves deduplication to Meta.
 */
export function trackOnce(
  key: string,
  event: 'Lead' | 'Purchase',
  params: Record<string, unknown>,
  eventID: string,
): void {
  const k = `px:${event}:${key}`;
  try {
    if (localStorage.getItem(k)) return;
  } catch {}
  track(event, params, eventID);
  try {
    localStorage.setItem(k, '1');
  } catch {}
}
