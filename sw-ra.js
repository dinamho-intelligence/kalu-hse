/* KALU · Realidad Asistida — Service Worker (namespaced -ra)
   Convive con el sw.js de la app principal: se registra con scope propio
   (solo la página realidad-asistida.html), así no pelean entre sí.
   Al publicar una versión nueva de la app del lente, subí el número de CACHE. */
const CACHE = 'kalu-ra-v3';
const SHELL = [
  'realidad-asistida.html',
  'manifest-ra.webmanifest',
  'icon-ra-192.png',
  'icon-ra-512.png'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL).catch(function(){}); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k.indexOf('kalu-ra-') === 0 && k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;                 // escritura (Supabase POST/PATCH): red directa
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;   // Supabase u otros dominios: red directa

  var isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0;
  if(isHTML){
    e.respondWith(
      fetch(req).then(function(r){
        var cp = r.clone(); caches.open(CACHE).then(function(c){ c.put(req, cp); }); return r;
      }).catch(function(){
        return caches.match(req).then(function(m){ return m || caches.match('realidad-asistida.html'); });
      })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function(m){
      return m || fetch(req).then(function(r){
        var cp = r.clone(); caches.open(CACHE).then(function(c){ c.put(req, cp); }); return r;
      });
    })
  );
});
