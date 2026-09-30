// ── Lucky Service Worker ─────────────────────────────────────────────────────
// Bump cache name on every release so users get fresh files.
const CACHE_NAME = 'lucky-v2';

const APP_SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/speech.js',
  '/js/translate.js',
  '/js/firebase.js',
  '/js/sw-register.js',
  '/manifest.json',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png'
];

// Skip caching for these external origins
const SKIP_ORIGINS = [
  'translate.googleapis.com',
  'api.mymemory.translated.net',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// ── Install: cache app shell ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for app shell, network-only for APIs ──────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip cross-origin API requests entirely
  if (SKIP_ORIGINS.some(origin => url.hostname.includes(origin))) {
    return; // let browser handle normally
  }

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Cache-first strategy for same-origin app shell
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Only cache valid same-origin responses
        const okType = response && (response.type === 'basic' || (response.type === 'cors' && url.hostname === 'www.gstatic.com'));
        if (!response || response.status !== 200 || !okType) {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
  );
});
