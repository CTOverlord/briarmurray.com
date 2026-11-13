// Sport Replay offline support. Scope: /replay/ only.
const CACHE = 'sport-replay-8f5eda5a9e';
// Body tracking files (23 MB) live in their own cache, kept across page updates and never re-downloaded.
const POSE_CACHE = 'replay-pose-1.1.1';
const SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('sport-replay-') && k !== CACHE) || (k.startsWith('replay-pose-') && k !== POSE_CACHE)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // The page itself: open the saved copy at once (no waiting on a weak signal), refresh it in the background.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const saved = await cache.match('./');
      const fresh = fetch(req).then((res) => { if (res.ok) cache.put('./', res.clone()); return res; });
      if (saved) { e.waitUntil(fresh.catch(() => {})); return saved; }
      try { return await fresh; } catch (err) { return Response.error(); }
    })());
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  // Body tracking files never change at a given address: saved copy, or fetch once and keep.
  if (sameOrigin && url.pathname.indexOf('/pose/') >= 0) {
    e.respondWith((async () => {
      const cache = await caches.open(POSE_CACHE);
      const saved = await cache.match(req);
      if (saved) return saved;
      const res = await fetch(req);
      if (res.ok) await cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Icons, manifest and fonts: saved copy first, refreshed in the background.
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(req);
    const fresh = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    });
    if (saved) { e.waitUntil(fresh.catch(() => {})); return saved; }
    return fresh;
  })());
});
