'use client';

import { useEffect } from 'react';
// Imported for its side effect: catches Chrome's install prompt as early as
// the office loads, for /admin/install to use. See src/lib/install.ts.
import '@/lib/install';

/**
 * Registers public/sw.js for the club office only. In development it stays
 * off: a worker caching pages fights with hot reload.
 */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/admin', updateViaCache: 'none' })
      .catch((err) => console.error('service worker not registered:', err));
  }, []);
  return null;
}
