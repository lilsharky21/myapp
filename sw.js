// ==========================================================================
// sw.js: the service worker. Keeps a copy of the app's own files on your
// device so it still opens (with your journal) when you have no signal.
// It always tries the internet first, so you get new versions right away;
// the saved copy is only used when the network is slow or offline.
// Market data (/api/...) is never stored here.
// ==========================================================================

const CACHE = 'thesis-shell-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/manifest.webmanifest', '/icons/icon-180.png', '/icons/icon-192.png',
  '/vendor/lightweight-charts/lightweight-charts.standalone.production.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  try {
    // Give the network 4 seconds before trying the saved copy
    return await Promise.race([network, new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 4000))]);
  } catch {
    const saved = (await cache.match(request, { ignoreSearch: true })) ?? (request.mode === 'navigate' ? await cache.match('/') : null);
    return saved ?? network; // nothing saved: keep waiting for the network
  }
}
