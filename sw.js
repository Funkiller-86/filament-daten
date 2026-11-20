// Hält die App-Dateien für den Offline-Betrieb bereit (Daten liegen in IndexedDB, nicht hier).
const NAME = "filament-app-v1";
const DATEIEN = ["./", "index.html", "app.js", "krypto.js", "style.css", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(NAME).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== NAME).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  if (u.pathname.endsWith("config.json")) return;
  // Netz zuerst (neue App-Version sofort), sonst Zwischenspeicher
  e.respondWith(fetch(e.request).then(r => { const k = r.clone(); caches.open(NAME).then(c => c.put(e.request, k)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
