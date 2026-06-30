// SwiftPMS staff PWA service worker.
// Strategy: network-first for app shell so deploys take effect immediately,
// cache-first for hashed asset URLs (everything under /assets/), and let
// API calls (firestore, cloud functions) pass through to network always.

const CACHE_NAME = "swiftpms-staff-v1";
const APP_SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept Firebase / Google APIs — always live network.
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("cloudfunctions.net") ||
    url.hostname.includes("identitytoolkit") ||
    url.hostname.includes("firestore") ||
    url.hostname.includes("firebaseappcheck") ||
    url.hostname.includes("peachpayments.com") ||
    url.hostname.includes("oppwa.com")
  ) {
    return;
  }

  // Cache-first for hashed assets (Vite emits /assets/index-XXXX.js etc.)
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Network-first for navigations + manifest (so deploys propagate immediately)
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match("/"))),
  );
});
