'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useRef } from 'react';
import { PIXEL_ID, track } from '@/lib/pixel';

/**
 * Loads the Meta Pixel on the public site and sends a PageView per page.
 *
 * Never on /admin: the club office is staff, not audience, and their visits
 * would pollute every audience and report built from this pixel.
 *
 * Meta's snippet sends the first PageView itself as it initialises; after
 * that the App Router changes pages without a reload, so later PageViews are
 * sent from here when the pathname changes. The first render is skipped to
 * avoid counting the landing page twice.
 */
export default function MetaPixel() {
  const pathname = usePathname();
  const first = useRef(true);
  const off = !PIXEL_ID || pathname.startsWith('/admin');

  useEffect(() => {
    if (off) return;
    if (first.current) {
      first.current = false;
      return;
    }
    track('PageView');
  }, [pathname, off]);

  if (off) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(PIXEL_ID)});
fbq('track', 'PageView');`}
    </Script>
  );
}
