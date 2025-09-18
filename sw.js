const CACHE = 'readonly-pwa-v21';
const CORE  = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate', e=>{
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if (url.hostname.includes('google.com') || url.hostname.includes('googleusercontent.com')){
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp=>{
      const copy = resp.clone();
      caches.open(CACHE).then(c=>c.put(e.request, copy));
      return resp;
    }))
  );
});
