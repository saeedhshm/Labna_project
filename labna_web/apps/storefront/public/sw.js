/* Offline shell and public catalog cache for the storefront.
 *
 * Only public, unauthenticated catalog content is cached. Authenticated,
 * transactional or staff/admin traffic is always network-only so stale prices,
 * stock, sessions or order state can never look authoritative while offline.
 */
const CACHE = 'labna-shell-v1';
const CATALOG_CACHE = 'labna-public-catalog-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/labna-icon.png'];
const publicCatalogPattern = /^\/api\/v1\/(banners|categories|branches|products)(\/[^/]+)?$/;

function isSafeCatalogRequest(url) {
  if (url.origin !== self.location.origin) return false;
  return publicCatalogPattern.test(url.pathname);
}

function staleWhileRevalidate(request) {
  return caches.open(CATALOG_CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      const fresh = fetch(request).then((response) => {
        // Cache only successful public JSON. Error responses and redirects are
        // intentionally skipped so stale failures do not mask recovery.
        if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
          cache.put(request, response.clone());
        }
        return response;
      });

      return cached ?? fresh.catch(() => cached);
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== CATALOG_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Stay out of other origins.
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // Safe public catalog responses are stale-while-revalidate. Everything
    // else, including customer auth, cart validation, checkout, orders,
    // cancellation, password changes, favorites mutations and admin routes,
    // remains network-only.
    if (isSafeCatalogRequest(url)) event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Navigations: serve the cached shell when the network is unavailable.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // Static assets: cache first, then fill the cache in the background.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
