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

**Our API**: All server routes are rate limited at 60 requests per minute per IP via a sliding window in `api/auth.ts`. This includes the token endpoint. Protected routes (aircraft metadata, GDELT events, AIS ships, FIRMS fires) additionally require a valid auth token in the `sigint_token` HttpOnly cookie. Rate limit state is in-memory — resets on server restart. Stale buckets are purged every 5 minutes.

---

## Client-Side vs Server-Side Fetching

Client-side: OpenSky (Heroku IPs blocked), USGS, NOAA Weather (no CORS restrictions).

Server-side: GDELT (CORS restrictions), AIS (API key, no browser CORS), FIRMS (API key, large payloads). See [Architecture](./architecture.md) for pipeline details.

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

The full aircraft metadata DB (~616K records) is downloaded once and cached in IndexedDB. All lookups are local `Map.get()` — no server round-trips per aircraft. If the DB hasn't loaded yet (first boot before download completes), aircraft show "Unknown" type until the next refresh after the DB is ready. The UI never blocks on enrichment. The DB route is versioned (`/api/aircraft/metadata/db/v1`) — bump both client and server when the DB is rebuilt.

---

## Ship Type Resolution

AIS vessel type codes arrive in `ShipStaticData` messages, not in `PositionReport` messages. A vessel that has only sent position reports will show "Unknown" type until a static data message arrives (typically within a few minutes). The server maps AIS type codes (20-90 range) to human-readable labels. The detail panel hides "Unknown" type and "Not defined" nav status to keep the display clean.

---

## Trail Recording

Trail recording is centralized in `DataContext` as a `useEffect` on `allData` changes. Both aircraft and ships feed the trail service from this single location.

---

## Trail Purging

Trail retention is type-aware. Aircraft trails are deleted after 8 missed refreshes (~32 minutes absent from data), capped at 50 points. Ship trails survive 60 missed refreshes (~1 hour), capped at 500 points — ships move slowly and need long history. Entries older than 24 hours removed at boot. Type determined by ID prefix (`A` = aircraft, `S` = ship).

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

Non-negotiable pattern. Every client-side fetch to our server (`/api/*`) must go through `lib/authService.ts`'s `authenticatedFetch()`. This wraps `fetch()` with `credentials: "same-origin"` so the browser sends the auth cookie automatically. On 401, refreshes the cookie and retries. Never call `fetch()` directly for server API routes.

---

## Server-Side Stale Cache Retention

FIRMS and GDELT server caches retain stale data when upstream returns 0 records (quota exhausted / temporary outage). This prevents the client from seeing an empty layer when the upstream API is temporarily down. The `sourceHealth` module on the client treats `"empty"` as NOT a down state for the same reason. The news cache follows the same pattern — stale articles retained if all RSS feeds fail.

**Client-side**: `BaseProvider.refresh()` applies the same stale retention — if the fetch returns 0 records but the cache has data, the cache is kept with a bumped timestamp. On boot, `cacheInit()` purges any poisoned empty caches (entries with `{ data: [] }`) so hydration falls through to a fresh fetch.

---

## News and Video Are NOT Geographic Features

Two pane types operate entirely outside the geographic data pipeline:

**RSS News** (`panes/news-feed/`): No lat/lon coordinates. Does NOT go into `DataPoint` union, `allData`, feature registry, globe rendering, spatial index, or ticker feed. Self-contained provider (`NewsProvider` — mirrors BaseProvider contract for `NewsArticle[]`), hook (`useNewsData`), and cache keys. Server-side RSS polling via `newsCache.ts`. However, news IS lifted to `DataContext` — the `useNewsData()` hook is called in the DataProvider, and `newsArticles` is exposed on the context value. This enables the correlation engine to link news articles to active regions, and any pane to access news without duplicate hook instances. `NewsFeedPane` reads from `useData()` — does NOT call `useNewsData()` directly.

**Video Feed** (`panes/video-feed/`): Not a data source at all — plays live HLS video streams from iptv-org. No data pipeline, no provider, no hook, no DataPoint. Self-contained pane with its own channel service (`channelService.ts`), persistence (`videoFeedPersistence.ts`), preset system, and HLS player. Channel list fetched client-side from `iptv-org.github.io`. Depends on `hls.js` (Apache 2.0) — `bun add hls.js` required.

---

## Correlation Engine

`lib/correlationEngine.ts` runs synchronously inside a `useMemo` in `DataContext`. It processes all `allData` + `newsArticles` on every data refresh.

**Performance**: Cross-source spatial matching uses a 2° grid index (same approach as `spatialIndex.ts`). Each query point checks ~9 neighboring cells — total cost is O(n) regardless of dataset size. Do NOT revert to naive nested loops (O(n²)) — with 60K+ data points this would block the main thread for seconds.

**Baseline persistence**: Regional baselines are persisted to IndexedDB under `sigint.intel.baseline.v1`. The baseline accumulates over days of use — do not clear it on data refresh. Users can clear it from Settings.

**Alert dedup**: Post-scoring dedup groups alerts by country + type + 1-hour bucket. The representative alert keeps the highest score and merged factors. The `count` field tracks how many events were collapsed. The `groupedItems` array holds all underlying DataPoints.

**Watch mode**: Watch state lives in `DataContext`, not in individual panes. The watch loop uses `setInterval` with refs (`watchItemsRef`, `watchEntriesRef`, `watchStateRef`) to avoid stale closures. The effect is keyed on `[watchState.active, watchState.paused, watchState.source]` — it does NOT restart when data refreshes (that would reset the timer). `currentItemSource` tracks which list ("alerts" or "intel") the current item came from — panes use this to gate highlight/scroll so only one pane lights up at a time during ALL mode.

---

## PWA & Offline

### Service Worker (`public/sw.js`)

Cache strategy: precache app shell on install (HTML, fonts, land data, worker, manifest), cache-first for same-origin assets, network-first for HTML navigation (fallback to cached `/` when offline), network-only for `/api/*` routes (data lives in IndexedDB, not SW cache). Cross-origin requests (OpenSky, USGS, NOAA, iptv-org) are not intercepted.

**Update flow**: New SW installs in background but does NOT call `self.skipWaiting()` during install. Instead it posts `SW_UPDATE_AVAILABLE` to all clients. The client shows an update banner. User clicks RELOAD → client posts `SW_SKIP_WAITING` → new SW activates → `controllerchange` fires → page reloads. This prevents silent mid-session code swaps.

**Registration** (`lib/swRegistration.ts`): Calls `navigator.serviceWorker.register()` immediately — no `window.addEventListener("load")` wrapper. Boot is async (awaits cacheInit + provider hydrate), so the load event fires before `registerSW()` runs. Wrapping in load event would silently skip registration. Three update detection paths: (1) `registration.waiting` check on load, (2) `updatefound` + `statechange === "installed"`, (3) `message` listener for `SW_UPDATE_AVAILABLE`. Dedup guard prevents double banners. Reload guard prevents double reload on `controllerchange`.

**`applyUpdate()`**: Gets the registration via `navigator.serviceWorker.getRegistration()` and posts `SW_SKIP_WAITING` to the waiting worker directly. Does NOT post to the controller (which is the OLD worker).

### ConnectionStatus (`components/ConnectionStatus.tsx`)

Renders as the first child in AppShell — always visible regardless of `chromeHidden`.

- **Offline**: Fixed red bar at top (`bg-sig-danger/90`, z-[9999]) with pulsing white dot + "OFFLINE — CACHED DATA ONLY" + RETRY button
- **RETRY**: Uses `new Image()` probe against `/icons/icon-72x72.png?_=${Date.now()}` — NOT `fetch()`. A failed `fetch()` to an API route can trigger the browser's dinosaur error page (replaces the SPA). Image loads are background requests that can never trigger navigation. If the image loads (server reachable), then reload. If `onerror` fires, reset button.
- **Pull-to-refresh**: Touch drag down from top of viewport (only when `scrollTop <= 5`). Rubber-band effect (capped at 120px, 0.5x diminishing). At 80px threshold, RefreshCw icon starts spinning. Release triggers `window.location.reload()` ONLY if `navigator.onLine` or `navigator.serviceWorker.controller` exists (cached page available). Never triggers dinosaur.
- **Reconnected**: Green bar with "RECONNECTED" auto-dismisses after 3 seconds. Only shows if the device was previously offline (`wasOffline` ref).

### Layout Preset Device Isolation

Layout presets use separate cache keys for mobile and desktop: `layoutPresetsDesktop` / `layoutPresetsMobile`. This prevents a 7-pane desktop layout from being loaded on a phone. Legacy presets (from `sigint.layout.presets.v1`) are migrated to desktop only on first load. Mobile starts with no presets. The SettingsModal "RESET LAYOUT" button clears all 6 layout keys (legacy + desktop + mobile).

### SettingsModal

- `paddingTop: env(safe-area-inset-top)` on the full-screen mobile panel so the close button isn't behind the iPhone status bar/Dynamic Island.
- Close button has 44×44px minimum tap target.
- Per-key delete buttons in the Storage tab are always visible (no hover-to-reveal — mobile has no hover). `hover:text-sig-danger` for visual feedback on desktop.

---

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