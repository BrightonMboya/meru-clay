/**
 * The club office's service worker — what makes /admin an installable app.
 *
 * Registered from src/components/admin/RegisterSW.tsx with scope /admin, so
 * the marketing site and /book never pass through it.
 *
 * It does one thing: when the network is gone, a page still opens. The coach
 * is often on a court with one bar of signal, so the Upcoming screen is kept
 * from its last successful load and shown when a fresh one cannot be had.
 * Every other page falls back to a short "you are offline" note. No page is
 * served from cache while the network works — the list is only useful if it
 * is current. Next's build assets (/_next/static) are content-hashed and never
 * change, so those are kept as they load, which is what lets the saved page
 * still look like itself offline.
 *
 * Signing out deletes the cache (see Sidebar.tsx), so a shared phone does
 * not keep the last coach's list of names and numbers.
 */

const CACHE = 'meru-office-v1';
const STATIC = 'meru-office-static';
/** Old builds' assets pile up across deploys; past this many, drop the oldest. */
const STATIC_MAX = 150;
const KEEP = ['/admin/upcoming'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('meru-office-') && key !== CACHE && key !== STATIC) {
          await caches.delete(key);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staticAsset(req));
    return;
  }

  // Otherwise full page loads only. Client-side navigations and the screens'
  // own fetches go straight to the network as if this were not here.
  if (req.mode !== 'navigate') return;

  const keep = KEEP.includes(url.pathname);

  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        // Only a real page: never a redirect to the login screen.
        if (keep && res.ok && !res.redirected) {
          const cache = await caches.open(CACHE);
          await cache.put(url.pathname, res.clone());
        }
        return res;
      } catch {
        if (keep) {
          const hit = await caches.match(url.pathname);
          if (hit) return hit;
        }
        return offline();
      }
    })(),
  );
});

async function staticAsset(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    const keys = await cache.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - STATIC_MAX))) await cache.delete(old);
  }
  return res;
}

function offline() {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#13271D"><title>Offline — Meru Clay</title>
<style>body{margin:0;min-height:100svh;display:flex;align-items:center;justify-content:center;
background:#fff;color:#13271D;font:16px/1.5 system-ui,sans-serif;padding:24px;text-align:center}
button{margin-top:16px;border:1px solid #e5e5e5;background:#fff;border-radius:999px;padding:10px 18px;
font:inherit;color:inherit}</style></head><body><div><strong>No connection</strong>
<p style="color:#737373;margin:6px 0 0">This page needs the internet. Open Upcoming to see the last list
that loaded, or try again once you have signal.</p>
<button onclick="location.href='/admin/upcoming'">Upcoming</button>
<button onclick="location.reload()">Try again</button></div></body></html>`,
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
