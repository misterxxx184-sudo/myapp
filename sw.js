// EROS — Service Worker
// Caches the app shell so it works 100% offline after first load.
// All data stays in localStorage on your device — nothing leaves your phone.

var CACHE = 'eros-v1';
var SHELL = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Space+Mono:wght@400;700&display=swap',
  'https://fonts.gstatic.com/s/cormorantgaramond/v22/BXRsvFTEx_BadMTzzuq9lm5sNXFqTqkvZQ.woff2',
  'https://fonts.gstatic.com/s/spacemono/v13/i7dPIFZifjKcF5UAWdDRYE58RWq7.woff2'
];

// Install — cache app shell
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      // Cache core files, ignore font failures (not critical)
      return cache.addAll(['/', '/index.html']).then(function() {
        return Promise.allSettled(
          SHELL.slice(2).map(function(url) { return cache.add(url); })
        );
      });
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate — clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch — serve from cache, fall back to network
self.addEventListener('fetch', function(e) {
  // Only handle GET requests
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;

      // Not in cache — fetch from network and cache it
      return fetch(e.request).then(function(response) {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        var clone = response.clone();
        caches.open(CACHE).then(function(cache) {
          cache.put(e.request, clone);
        });
        return response;
      }).catch(function() {
        // Offline fallback — return cached index
        return caches.match('/index.html');
      });
    })
  );
});
