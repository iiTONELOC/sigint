// ── SIGINT Service Worker ────────────────────────────────────────────
// Caches the app shell for offline boot. Data stays in IndexedDB.
// API routes pass through to network — providers handle failures.
//
// Update flow:
//   1. Deploy new code → browser detects new SW on periodic check
//   2. New SW installs in background (does NOT skipWaiting)
//   3. New SW posts 'SW_UPDATE_AVAILABLE' to all clients
//   4. Client shows update banner → user clicks RELOAD
//   5. Client posts 'SW_SKIP_WAITING' → new SW activates → page reloads

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
// Do NOT skipWaiting here — let the user choose when to activate.
// The new SW sits in "waiting" state until the client sends SW_SKIP_WAITING.

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(`[SW] Failed to precache ${url}:`, err.message);
            }),
          ),
        );
      })
      .then(() => {
        // Notify all clients that an update is ready
        self.clients.matchAll({ type: "window" }).then((clients) => {
          for (const client of clients) {
            client.postMessage({ type: "SW_UPDATE_AVAILABLE" });
          }
        });
      }),
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
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch strategy ───────────────────────────────────────────────────
//
// /api/*          → network only (data lives in IndexedDB, not SW cache)
// HTML (/)        → network first, fall back to cache (picks up updates)
// everything else → cache first, fall back to network (fonts, JS, CSS, data)

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
  // On failure (offline), serve cached "/" for ANY navigation request.
  // This is an SPA — all routes render the same index.html.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the HTML under both the actual URL and "/" for fallback
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
            // Also ensure "/" is cached for offline fallback
            if (url.pathname !== "/") {
              cache.put(new Request("/"), response.clone());
            }
          });
          return response;
        })
        .catch(() =>
          // Try exact URL first, then root, then any cached HTML
          caches
            .match(request)
            .then((r) => r || caches.match("/"))
            .then(
              (r) => r || caches.match(new Request(self.location.origin + "/")),
            )
            .then(
              (r) =>
                r ||
                new Response("Offline — no cached page available", {
                  status: 503,
                  headers: { "Content-Type": "text/plain" },
                }),
            ),
        ),
    );
    return;
  }

  // All other assets — cache first, fall back to network
  // Includes: JS/CSS chunks, fonts, land data, worker script, icons, manifest
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    }),
  );
});

// ── Message handling ────────────────────────────────────────────────
// SW_SKIP_WAITING — user clicked "RELOAD" in the update banner
// SW_CHECK_UPDATE — client asking if there's a waiting update

self.addEventListener("message", (event) => {
  if (event.data === "SW_SKIP_WAITING") {
    self.skipWaiting();
  }
});
