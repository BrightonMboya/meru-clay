import type { MetadataRoute } from 'next';

/**
 * Was public/robots.txt, which pointed at Astro's /sitemap-index.xml. Next
 * serves /sitemap.xml instead, so this is generated rather than static.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://meru-clay.vercel.app';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The club office and the booking endpoints are not for crawlers.
      disallow: ['/admin', '/api/'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
