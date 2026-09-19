import type { Metadata, Viewport } from 'next';
import { Archivo, Fraunces, Inter } from 'next/font/google';
import QueryProvider from '@/components/QueryProvider';
import './globals.css';

/**
 * Fonts are self-hosted by next/font — no render-blocking request to
 * fonts.googleapis.com, and no FOUT. Each exposes a CSS variable that
 * globals.css feeds into --font-sans / --font-display / --font-ui.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-archivo',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['300', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});

/** The admin shell only. See --font-ui in globals.css. */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://meru-clay.vercel.app');

const title = 'Meru Clay — Tanzania’s first true clay tennis court in Arusha';
const description =
  'Meru Clay is a members’ tennis club at the foot of Mount Meru in Arusha, Tanzania — two championship clay courts, floodlit evening play, clay-specialist coaching and a junior academy. Book a court or a lesson on WhatsApp.';

const geo = { lat: -3.31087, lng: 36.6397 };
const phone = '+255782628288';

export const metadata: Metadata = {
  metadataBase: site,
  title: { default: title, template: '%s' },
  description,
  alternates: { canonical: '/' },
  keywords: [
    'clay tennis court',
    'tennis club Arusha',
    'tennis Tanzania',
    'Mount Meru tennis',
    'clay court coaching',
    'junior tennis academy Arusha',
    'Ngaramtoni tennis',
  ],
  authors: [{ name: 'Meru Clay Tennis Club' }],
  robots: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
  },
  // The club crest, on its pine ground. All raster: the mark is a detailed
  // illustration, so there is no SVG to offer — and an SVG entry would win
  // over these in every browser that supports it.
  icons: {
    icon: [
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-48.png', type: 'image/png', sizes: '48x48' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'Meru Clay',
    title,
    description,
    url: '/',
    locale: 'en_US',
    images: [
      {
        url: '/images/og-image.jpg',
        type: 'image/jpeg',
        width: 1200,
        height: 630,
        alt: 'A clay tennis court at Meru Clay with a player serving in the low Arusha sun',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [{ url: '/images/og-image.jpg', alt: 'Clay tennis court at Meru Clay, Arusha' }],
  },
  // Geo / local SEO — no first-class Metadata field, so passed through.
  other: {
    'geo.region': 'TZ-01',
    'geo.placename': 'Ngaramtoni, Arusha, Tanzania',
    'geo.position': `${geo.lat};${geo.lng}`,
    ICBM: `${geo.lat}, ${geo.lng}`,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#13271D',
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${site.origin}/#website`,
      url: `${site.origin}/`,
      name: 'Meru Clay',
      description,
      inLanguage: 'en',
      publisher: { '@id': `${site.origin}/#club` },
    },
    {
      '@type': 'SportsActivityLocation',
      '@id': `${site.origin}/#club`,
      name: 'Meru Clay Tennis Club',
      alternateName: 'Meru Clay',
      description,
      url: `${site.origin}/`,
      image: new URL('/images/og-image.jpg', site).href,
      logo: new URL('/icon-512.png', site).href,
      telephone: phone,
      priceRange: 'TSh 15,000–480,000',
      currenciesAccepted: 'TZS',
      paymentAccepted: 'Cash, Mobile money',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Oltrumet, Ngaramtoni',
        addressLocality: 'Arusha',
        addressRegion: 'Arusha',
        addressCountry: 'TZ',
      },
      geo: { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lng },
      hasMap: 'https://www.google.com/maps?q=Meru+Clay+Tennis+Club,+Oltrumet',
      areaServed: { '@type': 'City', name: 'Arusha' },
      knowsLanguage: ['en', 'sw'],
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: [
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
            'Sunday',
          ],
          opens: '06:00',
          closes: '21:00',
        },
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${fraunces.variable} ${inter.variable}`}>
      <body className="antialiased">
        {/* TanStack Query backs every client fetch: /book's availability grid
            and the court desk. Mounted at the root so both subtrees share one
            browser cache. */}
        <QueryProvider>{children}</QueryProvider>
        <script
          type="application/ld+json"
          // Static object, no user input — safe to inline.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}
