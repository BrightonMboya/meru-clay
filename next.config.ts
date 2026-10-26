import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `/book` and `/api/*` are dynamic; everything else prerenders at build.
  // Nothing host-specific here any more — this deploys to any Node host.
  poweredByHeader: false,

  // PostHog, served from our own domain so blockers do not drop it — see
  // src/instrumentation-client.ts. PostHog's API paths end in a slash, which
  // Next would otherwise redirect away.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/array/:path*', destination: 'https://us-assets.i.posthog.com/array/:path*' },
      { source: '/ingest/:path*', destination: 'https://us.i.posthog.com/:path*' },
    ];
  },
};

export default nextConfig;
