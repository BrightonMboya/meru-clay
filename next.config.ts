import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `/book` and `/api/*` are dynamic; everything else prerenders at build.
  // Nothing host-specific here any more — this deploys to any Node host.
  poweredByHeader: false,
};

export default nextConfig;
