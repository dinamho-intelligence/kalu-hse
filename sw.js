/* KALU · Service Worker
   Igual que el tuyo (network-first para todo el sitio: online trae lo último,
   offline sirve lo último guardado), con UN agregado: cachea el jspdf del CDN
   para que el PDF de la tarjeta también se pueda generar sin señal. */
const CACHE = 'kalu-v2';
const EXTRA = ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(EXTRA)).then(() => self.skipWaiting()).catch(() => self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))) // limpiar caché vieja (evita servir versiones viejas)
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname.endsWith('supabase.co')) return;                 // nunca cachear API/Storage: van a la red
  if (url.origin !== location.origin && url.hostname !== 'cdn.jsdelivr.net') return; // solo mismo origen + jspdf

  // jspdf (CDN): cache-first, para tener el PDF offline
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const c = res.clone(); caches.open(CACHE).then(cache => cache.put(req, c)).catch(() => {}); return res;
    })));
    return;
  }

  // mismo origen: network-first con fallback a caché (como ya lo tenías)
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req))
  );
});
