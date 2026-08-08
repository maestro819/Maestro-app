// MAESTRO service worker
// Strategy:
// - App shell + CDN libraries: cache-first, refreshed in background (stale-while-revalidate)
//   -> app still opens instantly with no internet.
// - Supabase API calls: never touched by the SW (network only), so the app's own
//   online/offline + localStorage fallback logic keeps working exactly as designed.

const CACHE_VERSION = "maestro-v2";
const CACHE_NAME = `maestro-cache-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-72.png",
  "./icons/icon-96.png",
  "./icons/icon-128.png",
  "./icons/icon-144.png",
  "./icons/icon-152.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-384.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isSupabaseRequest(url) {
  return url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept writes (POST/PATCH/etc to Supabase)

  const url = new URL(req.url);

  // Let Supabase (data + realtime) traffic go straight to the network, untouched.
  if (isSupabaseRequest(url)) return;

  // Stale-while-revalidate for everything else (app shell + CDN libs + fonts).
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        // Return cached copy immediately, update cache silently in background.
        networkFetch;
        return cached;
      }
      const fresh = await networkFetch;
      if (fresh) return fresh;
      // Nothing cached and network failed: fall back to cached index.html for navigations.
      if (req.mode === "navigate") return cache.match("./index.html");
      return new Response("", { status: 504, statusText: "Offline" });
    })
  );
});
