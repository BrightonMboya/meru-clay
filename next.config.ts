import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `/book` and `/api/*` are dynamic; everything else prerenders at build.
  // Nothing host-specific here any more — this deploys to any Node host.
  poweredByHeader: false,

  // PostHog, served from our own domain so blockers do not drop it — see
  // src/instrumentation-client.ts. PostHog's API paths end in a slash, which
  // Next would otherwise redirect away.
  skipTrailingSlashRedirect: true,
  // The club office's service worker and manifest — see public/sw.js. The
  // worker must never be cached, or a fix to it waits on a browser's whim.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        source: '/admin.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/array/:path*', destination: 'https://us-assets.i.posthog.com/array/:path*' },
      { source: '/ingest/:path*', destination: 'https://us.i.posthog.com/:path*' },
    ];
  },
};

export default nextConfig;
