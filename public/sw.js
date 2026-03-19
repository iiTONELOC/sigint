// ── SIGINT Service Worker ────────────────────────────────────────────
// Caches the app shell for offline boot. Data stays in IndexedDB.
// API routes pass through to network — providers handle failures.
//
// Update flow: bump CACHE_VERSION or deploy new JS bundle → browser
// detects new SW → installs → posts 'SW_UPDATE_AVAILABLE' to client
// → client can reload to activate.

const CACHE_VERSION = "v1";
const CACHE_NAME = `sigint-shell-${CACHE_VERSION}`;

// App shell resources cached on install.
// JS/CSS filenames are hashed by the bundler — the post-build step
// generates sw-manifest.js with the actual filenames. If that file
// doesn't exist (dev mode), we cache on first fetch instead.
let PRECACHE_URLS = [
  "/",
  "/fonts.css",
  "/fonts/jetbrains-mono/JetBrainsMono-Regular.woff2",
  "/fonts/jetbrains-mono/JetBrainsMono-Bold.woff2",
  "/data/ne_50m_land.json",
  "/workers/pointWorker.js",
  "/manifest.json",
];

// Injected by post-build step — adds hashed JS/CSS chunk URLs
// e.g. self.__PRECACHE_MANIFEST = ["/chunk-abc123.js", "/chunk-def456.css"]
if (self.__PRECACHE_MANIFEST) {
  PRECACHE_URLS = PRECACHE_URLS.concat(self.__PRECACHE_MANIFEST);
}

// ── Install: precache app shell ──────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        // Use addAll for known URLs, but don't fail install if some are missing
        return Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(`[SW] Failed to precache ${url}:`, err.message);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches, claim clients ────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("sigint-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch strategy ───────────────────────────────────────────────────
//
// /api/*          → network only (data lives in IndexedDB, not SW cache)
// hashed assets   → cache first (immutable — hash changes on new deploy)
// HTML (/)        → network first, fall back to cache (picks up updates)
// everything else → cache first, fall back to network

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip cross-origin requests (iptv-org, OpenSky, USGS, NOAA, etc.)
  if (url.origin !== self.location.origin) return;

  // API routes — network only, let providers handle errors via IndexedDB
  if (url.pathname.startsWith("/api/")) return;

  // HTML navigation — network first so deploys land immediately
  if (request.mode === "navigate" || url.pathname === "/") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh HTML
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match("/") || caches.match(request))
    );
    return;
  }

  // Hashed assets (JS/CSS chunks) — cache first, immutable
  // Also fonts, land data, worker script, icons
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Cache successful responses for next time
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// ── Update notification ──────────────────────────────────────────────
// When a new SW is installed and waiting, notify all clients

self.addEventListener("message", (event) => {
  if (event.data === "SW_CHECK_UPDATE") {
    // Client is asking if there's an update — respond if we're the new SW
    event.source?.postMessage({ type: "SW_UPDATE_AVAILABLE" });
  }
  if (event.data === "SW_SKIP_WAITING") {
    self.skipWaiting();
  }
});
