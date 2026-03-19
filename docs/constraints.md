# Constraints & Gotchas

[← Back to Docs Index](./README.md)

**Related docs**: [Caching](./caching.md) · [Rendering](./rendering.md) · [Data Flow](./data-flow.md)

---

## Rate Limits

**OpenSky Network**: Anonymous access = 400 credits/day. Each `/states/all` call costs credits. The 240-second poll interval stays well under the limit for a full day of use.

**USGS**: Responses cached server-side for 60 seconds. Feed updates every 5 minutes. Our 420-second poll interval ensures every request gets fresh data. Exceeding limits returns 429.

**GDELT**: No explicit rate limit on raw export files — they're static files on a CDN, updated every 15 minutes. Our server fetches once per 15-minute interval regardless of client count. The server dedupes by tracking the last export URL fetched.

**aisstream.io**: WebSocket-based, no traditional rate limit. One persistent connection per server. Messages stream at ~300/sec globally. The server accumulates positions in memory and serves snapshots to clients. Connection is auto-reconnected on drop with a 10-second delay.

**NASA FIRMS**: API key required (free). Transaction-based — each global CSV query costs ~5 transactions. Limit resets every 10 minutes. Our server fetches once per 30-minute interval regardless of client count, well within limits. VIIRS NOAA-20 global data can return 30,000–100,000+ records per day.

**NOAA Weather**: No API key required — only a `User-Agent` header. No explicit rate limit documented but standard courtesy applies. Client polls every 300 seconds. Returns GeoJSON FeatureCollection of active severe weather alerts (US only).

**Our API**: All server routes are rate limited at 60 requests per minute per IP via a sliding window in `api/auth.ts`. This includes the token endpoint. Protected routes (aircraft metadata, GDELT events, AIS ships, FIRMS fires) additionally require a valid `X-SIGINT-Token` header. Rate limit state is in-memory — resets on server restart. Stale buckets are purged every 5 minutes.

---

## Client-Side vs Server-Side Fetching

OpenSky, USGS, and NOAA Weather are fetched client-side — OpenSky blocks Heroku IPs, USGS and NOAA have no CORS restrictions. Cannot proxy OpenSky through the server, cannot add auth headers.

GDELT raw export files have CORS restrictions — must be fetched server-side. The server downloads, unzips (using `zlib.inflateRaw`, zero deps), parses the tab-delimited CSV, filters to conflict/crisis CAMEO codes, and caches in memory. Clients fetch the parsed result from `/api/events/latest` with a server-issued token.

AIS data from aisstream.io does not support browser CORS and requires an API key that must not be exposed client-side. The server maintains a persistent WebSocket, accumulates vessel positions in an in-memory Map keyed by MMSI, and serves snapshots from `/api/ships/latest` with token auth. Clients poll every 300 seconds.

NASA FIRMS fire data requires an API key and returns large CSV payloads (30-100k records). Fetched server-side every 30 minutes, parsed, and cached in memory. Served from `/api/fires/latest` with token auth and gzip compression. Clients poll every 600 seconds.

---

## Canvas vs React

The globe is pure Canvas 2D. React components (Header, DetailPanel, etc.) are overlaid on top with absolute/fixed positioning. They communicate with the canvas via refs and props, not DOM events on canvas elements.

The **propsRef pattern**: The animation loop never re-registers. It reads `propsRef.current` each frame, synced from React props on every render. Max 1-frame delay between state change and canvas reflecting it.

---

## Web Worker Rendering

Point rendering runs in a dedicated Web Worker (`public/workers/pointWorker.js`) with its own OffscreenCanvas. The worker is plain JavaScript (not TypeScript) because it's served directly from `public/` with no build step.

**Constraints:**

- Worker code cannot import from the main codebase — all logic (projection, interpolation, filtering, age helpers, aircraft filter matching) is inlined
- `Set` objects cannot cross `postMessage` — serialized to arrays before sending, used as arrays in worker
- Trail data is synced periodically (~every 30 frames), not every frame
- The worker's `matchesAircraftFilter` must exactly match the real one in `features/tracking/aircraft/lib/utils.ts` — if the filter logic changes, the worker must be updated manually
- OffscreenCanvas must be resized in the worker when viewport dimensions change — the main thread sends W, H, dpr each frame

**IMPORTANT**: The `aisCache.ts` uses `require("ws")` specifically to bypass Bun's native WebSocket TLS issues inside `Bun.serve()` on Heroku. Do NOT change this to `import` or to Bun's native `WebSocket`.

---

## Server Routes for Static Files

Both `index.ts` and `index.prod.ts` serve static files from `public/` via explicit route patterns:

- `/fonts.css` and `/fonts/*` — font files
- `/data/*` — land geometry JSON
- `/workers/*` — Web Worker scripts

New static file directories require adding a matching route pattern to both server files.

---

## Metadata Enrichment

Best-effort only. If the server is down or the ICAO24 isn't in the database, the aircraft shows "Unknown" type. The UI never blocks on enrichment. Only fires for the currently selected aircraft to prevent cache bloat.

---

## Ship Type Resolution

AIS vessel type codes arrive in `ShipStaticData` messages, not in `PositionReport` messages. A vessel that has only sent position reports will show "Unknown" type until a static data message arrives (typically within a few minutes). The server maps AIS type codes (20-90 range) to human-readable labels. The detail panel hides "Unknown" type and "Not defined" nav status to keep the display clean.

---

## Trail Recording

Trail recording is centralized in `DataContext` as a `useEffect` on `allData` changes. Both aircraft and ships feed the trail service from this single location.

---

## Trail Purging

If an aircraft or ship disappears from data for 3 consecutive refreshes (~12 minutes for aircraft, ~15 minutes for ships), its trail is deleted. Entries older than 24 hours removed at boot. Points capped at 50 per entity.

---

## Zoom Limits

Globe mode zoom: min 0.55, max 350. Flat mode zoom: min 0.85, max 500.

Double-click zoom: progressive — 8x current zoom, min 80, max 500 (flat) / 350 (globe). Globe mode snaps rotation immediately and lerps only zoom. Double-click again to zoom deeper.

Single-click on a point preserves current zoom level and pans to the point — no zoom reset. Auto-rotate stops permanently on selection (re-enable via ROT button).

---

## Gzip Compression

Both `/api/events/latest` and `/api/ships/latest` gzip-compress responses when the client sends `Accept-Encoding: gzip`. Uses `Bun.gzipSync`. Extracted to a shared `jsonResponse` helper in `api/index.ts`.

---

## IndexedDB

Auto-migrates from localStorage on first run (one-time). No practical size limit (browser-dependent, typically hundreds of MB to GB). The aircraft cache overwrites itself every 240 seconds. The ship cache overwrites every 300 seconds. The earthquake cache overwrites every 420 seconds. Layout state overwrites on every change.

---

## All Providers Cache to IndexedDB

Non-negotiable pattern. Every live data provider implements:

- `hydrate()` — read from IndexedDB on boot, reject if stale
- `persistCache()` — write after every successful fetch
- Fallback chain: memory → IndexedDB → empty/mock on error

Staleness thresholds must be tighter than or equal to the poll interval so stale cache is rejected and the immediate fetch fires on boot.

The 5 non-aircraft providers inherit this from `BaseProvider`. New providers should extend `BaseProvider` with a config object rather than duplicating the pattern.

---

## All Server API Calls Use authenticatedFetch

Non-negotiable pattern. Every client-side fetch to our server (`/api/*`) must go through `lib/authService.ts`'s `authenticatedFetch()`. This handles token acquisition, caching, and auto-refresh on 401. Never call `fetch()` directly for server API routes.

---

## Server-Side Stale Cache Retention

FIRMS and GDELT server caches retain stale data when upstream returns 0 records (quota exhausted / temporary outage). This prevents the client from seeing an empty layer when the upstream API is temporarily down. The `sourceHealth` module on the client treats `"empty"` as NOT a down state for the same reason.

---

## Preferences (Development)

- **Types ONLY, never interfaces** — intellisense populates types better
- **Tailwind classes ONLY** — no inline `style=` except dynamic per-item colors
- **Async storage** — IndexedDB for all persistence, no localStorage
- **External links** — `target="_blank" rel="noopener noreferrer"` on every external link
- **@ts-ignore comments are intentional** — preserve them
- **No console.log in production code**
- **Worker code is plain JS** — served from `public/workers/`, no build step
- **Red reserved for danger/alerts only** — never decorative
- **Cache is sacred** — don't fetch when cache is fresh, only fetch when stale
- **OpenSky fetches client-side** — Heroku IPs blocked, this is by design
- **`require("ws")` stays in aisCache.ts** — bypasses Bun native WebSocket TLS issues