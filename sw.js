'use strict';

const CACHE_VERSION = 'eros-v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const FONT_CACHE = `fonts-${CACHE_VERSION}`;

// Core app shell files
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install — cache app shell
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
  );
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !key.includes(CACHE_VERSION))
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Google Fonts stylesheets
  if (url.origin === 'https://fonts.googleapis.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        fetch(req).then(res => {
          cache.put(req, res.clone());
          return res;
        }).catch(() => cache.match(req))
      )
    );
    return;
  }

  // Google Fonts font files
  if (url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(req).then(res =>
          res ||
          fetch(req).then(networkRes => {
            cache.put(req, networkRes.clone());
            return networkRes;
          })
        )
      )
    );
    return;
  }

  // App navigation requests (SPA)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then(cache => {
            cache.put('/index.html', copy);
          });
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Default: cache first, then network
  event.respondWith(
    caches.match(req).then(res =>
      res ||
      fetch(req).then(networkRes => {
        if (req.method === 'GET') {
          caches.open(STATIC_CACHE).then(cache => {
            cache.put(req, networkRes.clone());
          });
        }
        return networkRes;
      })
    )
  );
});
