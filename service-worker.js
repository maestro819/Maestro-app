// Service worker Maestro Pay
// Cache "app shell" biar bisa dibuka offline. Data transaksi/produk tetap
// disimpan aplikasi sendiri di localStorage (sudah ada di kode aslinya),
// jadi kasir tetap bisa jualan walau internet mati, lalu sinkron lagi
// begitu online.

const CACHE_NAME = 'maestro-pay-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

// Install: simpan file utama ke cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

// Activate: buang cache versi lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - Request ke domain sendiri (HTML/JSON/ikon) -> cache-first, fallback ke network
// - Request ke domain lain (Supabase, CDN, dll) -> biarkan lewat langsung ke network
//   (jangan diintervensi, supaya data toko/transaksi tetap real-time saat online)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return; // biarkan request ke luar (Supabase/CDN) jalan normal
  }

  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      // Kalau ada di cache, tampilkan dulu (cepat), tapi tetap update cache di
      // belakang layar. Kalau belum ada, tunggu network.
      return cached || networkFetch;
    })
  );
});
