// KALU QA/QC · Service Worker
// Cachea solo el app-shell de qaqc (network-first). No toca otras apps ni Supabase.
const CACHE = 'kalu-qaqc-v1';
const SHELL = ['/qaqc.html', '/manifest-qaqc.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Solo el mismo origen y solo el shell de qaqc. Todo lo demás (Supabase, otras apps) pasa directo.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname !== '/qaqc.html' && !SHELL.includes(url.pathname)) return;

  // network-first: online trae lo último y actualiza el cache; offline sirve lo guardado.
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/qaqc.html')))
  );
});
