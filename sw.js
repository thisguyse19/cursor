/* Minimal service worker for installability and offline shell (GitHub Pages–friendly). */
const CACHE = 'triple-v42';

function isContentJsonUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.includes('/content/') && u.pathname.endsWith('.json');
  } catch {
    return false;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => {
        const scope = self.registration.scope;
        const urls = [
          new URL('index.html', scope).href,
          new URL('styles/app.css', scope).href,
          new URL('js/airlines.js', scope).href,
          new URL('js/app.js', scope).href,
          new URL('manifest.webmanifest', scope).href,
          new URL('icons/icon-1024.png', scope).href,
          new URL('icons/apple-touch-icon.png', scope).href,
          new URL('icons/icon-192.png', scope).href,
          new URL('icons/icon-512.png', scope).href,
          new URL('icons/maskable-512.png', scope).href,
        ];
        return cache.addAll(urls).catch((err) => {
          console.warn('[Triple SW] precache partial', err);
        });
      })
      .then(() => {
        // First install: take control immediately. Updates: stay in "waiting" until the page sends SKIP_WAITING.
        if (!self.registration.active) {
          return self.skipWaiting();
        }
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.url.includes('flights-live.json')) {
    event.respondWith(fetch(req));
    return;
  }

  /* Trip data and other bundled JSON: network-first so PWA updates show new flights/content after Reload. */
  if (isContentJsonUrl(req.url)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(new URL('index.html', self.registration.scope).href)
      )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        if (res.ok && req.url.startsWith(self.registration.scope)) {
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
