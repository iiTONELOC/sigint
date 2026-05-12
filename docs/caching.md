# Caching Architecture

[← Back to Docs Index](./README.md)

**Related docs**: [Data Flow](./data-flow.md) · [Constraints](./constraints.md) · [Pane System](./panes.md)

---

## Overview

The application uses a unified IndexedDB-backed storage service (`lib/storageService.ts`) for all persistent caching. On first run it auto-migrates any existing localStorage data. All reads use `cacheGet()` which is async (memory first, IndexedDB fallback). `cacheInit()` fires non-blocking at boot, populating memory in the background. Writes go to both memory and IndexedDB (fire-and-forget).

At boot, `cacheInit()` runs a cleanup pass: trail entries older than 24 hours are removed, and trail points are capped per entity type (50 for aircraft, 500 for ships) to prevent unbounded growth.

**Every live data provider follows the same caching pattern**: hydrate asynchronously from IndexedDB via `cacheGet()` (with staleness rejection), persist after every successful fetch, and fall back through memory cache → IndexedDB cache → empty on error. The 5 non-aircraft providers inherit this pattern from `BaseProvider` (`features/base/BaseProvider.ts`). Server-side, FIRMS and GDELT caches retain stale data when upstream returns 0 records (quota exhausted / temporary outage).

---

## Cache Keys

| Key | Owner | Contains | Written | Staleness |
|---|---|---|---|---|
| `sigint.adsbfi.aircraft-cache.v1` | AircraftProvider | Full DataPoint[] (records already enriched server-side via `ac-db.sqlite`) | Every 240s | Rejected on hydrate if >30min |
| `sigint.usgs.earthquake-cache.v1` | earthquakeProvider | USGS earthquake DataPoint[] (7 days) | Every 420s | Rejected on hydrate if >30min |
| `sigint.gdelt.events-cache.v1` | gdeltProvider | GDELT event DataPoint[] (7-day rolling window, URL-deduped) | Every 15 min | Rejected on hydrate if >30min, events >7 days pruned on merge |
| `sigint.ais.ship-cache.v1` | shipProvider | AIS vessel DataPoint[] | Every 300s | Rejected on hydrate if >30min |
| `sigint.firms.fire-cache.v1` | fireProvider | NASA FIRMS fire DataPoint[] (24h) | Every 600s | Rejected on hydrate if >30min |
| `sigint.noaa.weather-cache.v1` | weatherProvider | NOAA severe weather alert DataPoint[] | Every 300s | Rejected on hydrate if >30min |
| `sigint.trails.v1` | trailService | Map of entity ID → position history | Every 30s | Entries >24h removed at boot. Aircraft: 50 points cap, 32min miss tolerance. Ships: 500 points cap, 1hr miss tolerance. |
| `sigint.land.hd.v1` | landService | HD coastline polygon data | After first fetch | Never expires |
| `sigint.nhc.cyclones-cache.v1` | cycloneProvider | NHC active storms snapshot (DataPoint[] + forecast points) | Every 30 min | Rejected on hydrate if >30min |
| `sigint.nhc.cyclone-dossier-cache.v1` | DossierPane | Per-storm NHC text products (advisory, discussion, wind probs) | On each dossier fetch | 30 min TTL per entry |
| `sigint.layout.v1` | PaneManager | Binary split tree layout + minimized panes (LEGACY — migration fallback) | On every layout change | Never expires |
| `sigint.layout.desktop.v1` | PaneManager | Desktop binary split tree layout + minimized panes | On every layout change (desktop) | Never expires |
| `sigint.layout.mobile.v1` | PaneManager | Mobile binary split tree layout + minimized panes | On every layout change (mobile) | Never expires |
| `sigint.layout.presets.v1` | PaneManager | Named layout preset configurations (LEGACY — migrated to desktop on first load) | On save/update/delete | Never expires |
| `sigint.layout.presets.desktop.v1` | PaneManager | Desktop named layout preset configurations | On save/update/delete (desktop) | Never expires |
| `sigint.layout.presets.mobile.v1` | PaneManager | Mobile named layout preset configurations | On save/update/delete (mobile) | Never expires |
| `sigint.dossier.cache.v1` | DossierPane | Aircraft dossier responses (max 200 entries) | On each dossier fetch | 30 min TTL per entry |
| `sigint.videofeed.state.v1` | VideoFeedPane | Grid layout + channel selections | On slot/grid change | Never expires |
| `sigint.videofeed.presets.v1` | VideoFeedPane | Named channel preset configurations | On save/delete | Never expires |
| `sigint.news.articles.v1` | newsProvider | RSS news articles (up to 200) | Every 600s | Rejected on hydrate if >12h |
| `sigint.news.state.v1` | NewsFeedPane | Selected article ID + source filter | On selection/filter change | Never expires |
| `sigint.intel.baseline.v1` | correlationEngine | Regional per-country event count baselines (168 hourly buckets per country, 7-day rolling window) | On every correlation computation | Pruned to 7 days on each run. User clearable from Settings. |
| `sigint.alerts.dismissed.v1` | AlertLogPane | Set of dismissed alert item IDs | On dismiss/restore | Never expires (user clearable) |
| `sigint.ticker.speed.v1` | Ticker | Scroll speed (0–100 px/s) | On settings change | Never expires |

---

## Staleness & Hydration

Each provider's hydration staleness threshold is set so that stale cache is rejected and the hook's immediate fetch fires rather than waiting a full poll interval with old data:

| Provider | Poll Interval | Staleness Threshold | Rationale |
|---|---|---|---|
| Aircraft | 240s | 30 min | Generous hydration window — cached data shows instantly, live data replaces within 4 min |
| Earthquake | 420s | 30 min | USGS feed updates every 5 min, 30 min allows several missed cycles |
| Events | 15 min | 30 min | GDELT updates every 15 min, 30 min allows one missed cycle |
| Ships | 300s | 30 min | Generous hydration window — positions update within 5 min |
| Fires | 600s | 30 min | FIRMS updates every 30 min server-side; matches server poll |
| Weather | 300s | 30 min | Generous hydration window — alerts update within 5 min |
| News | 600s | 12 hours | Non-geographic, stale articles are still useful — generous window |

The 5 geographic providers (plus aircraft) use a **uniform 30-minute hydration staleness window**. This was standardized to prevent the "mock data flash" problem — when the cache TTL was too tight (e.g., 235s for aircraft, 5min for ships), reloading the page would show mock/empty data for several seconds before live data arrived. News uses a 12-hour window since stale articles remain useful.

### Client-Side Stale Cache Retention

`BaseProvider.refresh()` retains existing cached data when the upstream fetch returns 0 records (quota exhausted, temporary outage). This mirrors the server-side pattern in `firmsCache.ts` and `gdeltCache.ts`. The cache timestamp is bumped so it doesn't appear stale to `getData()`, and the next poll retries. This prevents the "empty wipe" bug where a single empty upstream response would destroy hours of accumulated data.

### Poisoned Cache Purge

On boot, `cacheInit()` scans all 7 data cache keys. Any entry holding `{ data: [] }` (poisoned by a previous empty upstream response that was persisted before the stale retention fix) is deleted from both memory and IndexedDB. This ensures hydration falls through and the next poll fetches fresh data from the server.

---

## Aircraft Data Cache

The provider has a two-tier cache: an in-memory object (`this.cache`) and IndexedDB via `storageService`. On boot, `hydrate()` is called by the boot sequence in `frontend.tsx` — reads from memoryCache (populated by `cacheInit`), populates `this.cache` + `this.snapshot`, and notifies the hook.

Aircraft records are already enriched (acType / registration / operator / manufacturer / model / military / originCountry) by the time the client receives them — see [Data Flow — Enrichment Pipeline](./data-flow.md#enrichment-pipeline). The client provider is a pure shape mapper. Enriched records are persisted to IndexedDB, so the IDB cache retains all enrichment across page reloads with no client-side DB to maintain.

---

## Server-side Aircraft Metadata DB

`src/server/data/ac-db.sqlite` (~46 MB, ~617k records) is a read-only SQLite file baked into the production image at build time. `scripts/build-aircraft-db.ts` generates it from the source NDJSON (`ac-db.ndjson`, removed at stage 2 of the Docker build — only the SQLite ships). `src/server/api/aircraftEnrichment.ts` opens the DB read-only on the first sweep, caches one prepared statement, and answers each lookup in <0.05 ms.

The DB ages by source-NDJSON cadence — `AC_DB_STALE_THRESHOLD_MS` (90 days) is the operator-visible warning threshold for regenerating via `bun run build:aircraft-db`. No client involvement; the client never sees the metadata DB itself.

---

## Ship Data Cache

Standard provider pattern. Server-side data is in-memory only (repopulates from aisstream.io WebSocket on restart). Client persists to IndexedDB, hydrates on boot with 30-min staleness.

---

## Trail Cache

Each trail point stores `{ lat, lon, ts, altitude?, speed?, heading? }`. The trail service records actual positions from each data refresh and uses speed + heading for between-refresh interpolation. Consumed for drawing trail lines behind selected items and for smoothly animating all moving points between refresh intervals. Trail recording is centralized in `DataContext` as a `useEffect` on `allData` changes, feeding both aircraft and ship positions to the trail service.

Trail retention is **type-aware** — ships move slowly and need much longer history:

| Setting | Aircraft | Ships |
|---|---|---|
| Movement threshold | 0.001° (~100m) | 0.0002° (~22m) |
| Max trail points | 50 (~3.3hrs) | 500 (days of history) |
| Missed refresh tolerance | 8 refreshes (~32min) | 60 refreshes (~1hr) |
| Miss threshold | 3 min | 5 min |
| Interpolation extrapolation | 10 min | 30 min |

Type is determined by ID prefix: `S` = ship, `A` = aircraft. The Web Worker's `getInterp()` function also uses ID prefix to apply the correct extrapolation limit (30min for ships, 10min for aircraft).

---

## IndexedDB Migration

On first run, `storageService` auto-migrates any existing localStorage data to IndexedDB and removes the old keys. One-time operation. IndexedDB has no practical size limit (browser-dependent, typically hundreds of MB to GB), eliminating the 5MB localStorage quota that previously caused trail persistence failures.