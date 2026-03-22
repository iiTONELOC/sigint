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
        // Use a slight delay so clients have time to set up message listeners
        return new Promise((resolve) => {
          setTimeout(() => {
            self.clients.matchAll({ type: "window" }).then((clients) => {
              for (const client of clients) {
                client.postMessage({ type: "SW_UPDATE_AVAILABLE" });
              }
              resolve();
            });
          }, 500);
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
      .then(() => self.clients.claim())
      .then(() => {
        // After claiming, notify again in case install message was missed
        self.clients.matchAll({ type: "window" }).then((clients) => {
          for (const client of clients) {
            client.postMessage({ type: "SW_UPDATE_AVAILABLE" });
          }
        });
      }),
  );
});

// ── Fetch strategy ───────────────────────────────────────────────────
//
// /api/*          → network only (data lives in IndexedDB, not SW cache)
// HTML (/)        → cache first (app loads instantly), background update
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

  // HTML navigation — cache first so app loads instantly like a native app.
  // Background fetch updates the cache for next load.
  // If no cache exists (first visit), fall through to network.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("/").then((cached) => {
        // Background: fetch fresh HTML and update cache
        const fetchAndUpdate = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(new Request("/"), clone);
                if (url.pathname !== "/") {
                  cache.put(request, response.clone());
                }
              });
            }
            return response;
          })
          .catch(() => null);

        if (cached) {
          // Serve cached immediately — background fetch updates for next time
          fetchAndUpdate; // fire and forget
          return cached;
        }

        // No cache (first visit) — wait for network
        return fetchAndUpdate.then(
          (response) =>
            response ||
            new Response(
              '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SIGINT</title><style>body{margin:0;background:#0a1420;color:#00d4f0;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}.c{max-width:320px}.d{width:8px;height:8px;background:#00d4f0;border-radius:50%;margin:0 auto 16px;animation:p 1.5s infinite}@keyframes p{0%,100%{opacity:.3}50%{opacity:1}}button{background:none;border:1px solid #00d4f0;color:#00d4f0;padding:8px 20px;font-family:monospace;cursor:pointer;margin-top:12px;border-radius:4px}button:hover{background:#00d4f020}</style></head><body><div class="c"><div class="d"></div><div>SIGINT</div><div style="font-size:11px;margin-top:8px;opacity:.6">Waiting for server...</div><button onclick="location.reload()">RETRY</button><script>setInterval(()=>{fetch("/").then(r=>{if(r.ok)location.reload()}).catch(()=>{})},10000)</script></div></body></html>',
              {
                status: 503,
                headers: { "Content-Type": "text/html" },
              },
            ),
        );
      }),
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

self.addEventListener("message", (event) => {
  if (event.data === "SW_SKIP_WAITING") {
    self.skipWaiting();
  }
});
