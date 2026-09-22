import type { MetadataRoute } from 'next';

/**
 * Replaces @astrojs/sitemap. /book is excluded for the same reason it was
 * there: it is a live, request-rendered form, not a page worth indexing.
 * /admin is staff-only and must never be listed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://meru-clay.vercel.app';
  return [
    {
      url: `${base}/`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      // Listed, unlike /book: this one is a destination members are sent to
      // and will look for again, and there is nothing live on it to go stale.
      url: `${base}/renew`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
