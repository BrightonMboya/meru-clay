/**
 * Runs in the browser before the app is interactive — Next's place for
 * analytics. Starts PostHog; src/lib/analytics.ts is how the rest of the app
 * talks to it.
 *
 * Events go to /ingest on our own domain, which next.config.ts rewrites to
 * PostHog's US region. Blockers drop requests to *.posthog.com, and on a small
 * site that is a share of visitors big enough to make every number wrong.
 *
 * /admin is never counted: the club office is staff, not audience. The check
 * is per event rather than at start-up because the App Router moves between
 * the two without a reload.
 */

import posthog from 'posthog-js';
import { POSTHOG_KEY } from '@/lib/analytics';

if (POSTHOG_KEY) {
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      // Pageviews on client-side navigation, page leave, and the rest of the
      // current recommended behaviour, pinned so an upgrade cannot shift it.
      defaults: '2026-08-30',
      // Recordings show what someone did, never what they typed: phone
      // numbers and names stay on our side.
      session_recording: { maskAllInputs: true },
      before_send: (event) => (window.location.pathname.startsWith('/admin') ? null : event),
    });
  } catch {
    // Analytics failing must never take the site with it.
  }
}
