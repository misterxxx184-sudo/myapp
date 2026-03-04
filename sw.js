/* ═══════════════════════════════════════════════════════════════
   EROS — Mastery System  |  Service Worker
   Strategy:
     • App Shell (index.html)  → Cache-first, background update
     • Google Fonts CSS        → Stale-while-revalidate (1 week TTL)
     • Google Fonts woff2      → Cache-first, very long TTL (immutable)
     • Everything else         → Network-first with offline fallback
   ═══════════════════════════════════════════════════════════════ */

const VERSION      = 'v1';
const SHELL_CACHE  = `eros-shell-${VERSION}`;
const FONTS_CACHE  = `eros-fonts-${VERSION}`;
const RUNTIME_CACHE= `eros-runtime-${VERSION}`;

/* Files cached immediately on install */
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png'
];

/* ── INSTALL ────────────────────────────────────────────────── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => {
      return cache.addAll(PRECACHE).catch(err => {
        /* Tolerate partial failures (e.g. icons not yet deployed) */
        console.warn('[SW] Precache partial failure:', err);
      });
    })
  );
});

/* ── ACTIVATE ───────────────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== FONTS_CACHE && k !== RUNTIME_CACHE)
          .map(k => { console.log('[SW] Purging old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ──────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* ── 1. Non-GET → straight to network ── */
  if (request.method !== 'GET') return;

  /* ── 2. Chrome extension / non-http(s) → ignore ── */
  if (!url.protocol.startsWith('http')) return;

  /* ── 3. Google Fonts CSS — stale-while-revalidate ── */
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(request, FONTS_CACHE));
    return;
  }

  /* ── 4. Google Fonts woff2 — cache-first (immutable assets) ── */
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONTS_CACHE));
    return;
  }

  /* ── 5. App shell & local assets — cache-first + bg update ── */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithUpdate(request));
    return;
  }

  /* ── 6. Everything else — network-first with cache fallback ── */
  event.respondWith(networkFirst(request));
});

/* ═══════════════════════════════════════════════════════════════
   STRATEGY HELPERS
   ═══════════════════════════════════════════════════════════════ */

/** Cache-first: serve from cache; only hit network if not cached. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/**
 * Cache-first with background update:
 * Serve cached copy immediately, then fetch fresh copy and update cache.
 * On next visit the fresh copy is served.
 */
async function cacheFirstWithUpdate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const fetchAndUpdate = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached); /* network failure is ok — we have cache */

  return cached || fetchAndUpdate;
}

/** Stale-while-revalidate: serve cache instantly, update in background. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });

  return cached || networkFetch;
}

/** Network-first: try network; fall back to cache; finally offline page. */
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    /* Last resort: serve the app shell so the SPA can handle it */
    const shell = await caches.match('/index.html', { cacheName: SHELL_CACHE });
    return shell || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

/* ── BACKGROUND SYNC (optional future use) ──────────────────── */
self.addEventListener('sync', event => {
  if (event.tag === 'eros-sync') {
    event.waitUntil(Promise.resolve()); /* placeholder */
  }
});
