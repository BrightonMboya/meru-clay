/**
 * PostHog — how people actually use the site.
 *
 * The Meta Pixel (src/lib/pixel.ts) answers "which ads pay". This answers
 * everything else: who visits, where they drop out of booking, how many press
 * pay and how many of those end up paid. src/instrumentation-client.ts starts
 * PostHog; this is the one door events go through.
 *
 * Everything here is a no-op until PostHog has loaded, so a deployment with
 * no NEXT_PUBLIC_POSTHOG_KEY, a visitor with a blocker, or server rendering
 * all behave exactly as if analytics were off.
 *
 * Event names are snake_case, object first, so they sort together in
 * PostHog's event list: booking_*, trial_*, payment_*.
 */

import posthog from 'posthog-js';

export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '';

export type AnalyticsEvent =
  | 'booking_slot_picked'
  | 'booking_mode_chosen'
  | 'booking_submitted'
  | 'booking_confirmed'
  | 'booking_failed'
  | 'trial_submitted'
  | 'payment_succeeded';

export function capture(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !posthog.__loaded) return;
  posthog.capture(event, props);
}

/**
 * Capture at most once per browser for a given key — for the /pay page, which
 * can be reopened from a WhatsApp link long after and still say PAID. Storage
 * can be unavailable (private mode); then it simply fires.
 */
export function captureOnce(
  key: string,
  event: AnalyticsEvent,
  props?: Record<string, unknown>,
): void {
  const k = `ph:${event}:${key}`;
  try {
    if (localStorage.getItem(k)) return;
  } catch {}
  capture(event, props);
  try {
    localStorage.setItem(k, '1');
  } catch {}
}
