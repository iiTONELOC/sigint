# Caching Architecture

[← Back to Docs Index](./README.md)

**Related docs**: [Data Flow](./data-flow.md) · [Constraints](./constraints.md) · [Pane System](./panes.md)

---

## Overview

The application uses a unified IndexedDB-backed storage service (`lib/storageService.ts`) for all persistent caching. On first run it auto-migrates any existing localStorage data. All reads use `cacheGet()` which is async (memory first, IndexedDB fallback). `cacheInit()` fires non-blocking at boot, populating memory in the background. Writes go to both memory and IndexedDB (fire-and-forget).

At boot, `cacheInit()` runs a cleanup pass: trail entries older than 24 hours are removed, and trail points are capped at 50 per entity (~3.3 hours at 4-minute intervals) to prevent unbounded growth.

**Every live data provider follows the same caching pattern**: hydrate asynchronously from IndexedDB via `cacheGet()` (with staleness rejection), persist after every successful fetch, and fall back through memory cache → IndexedDB cache → empty on error. The 5 non-aircraft providers inherit this pattern from `BaseProvider` (`features/base/BaseProvider.ts`). Server-side, FIRMS and GDELT caches retain stale data when upstream returns 0 records (quota exhausted / temporary outage).

---

## Cache Keys

| Key | Owner | Contains | Written | Staleness |
|---|---|---|---|---|
| `sigint.opensky.aircraft-cache.v1` | AircraftProvider | Full DataPoint[] with enriched metadata | Every 240s + after enrichment | Rejected on hydrate if >30min |
| `sigint.usgs.earthquake-cache.v1` | earthquakeProvider | USGS earthquake DataPoint[] (7 days) | Every 420s | Rejected on hydrate if >30min |
| `sigint.gdelt.events-cache.v1` | gdeltProvider | GDELT event DataPoint[] (7-day rolling window, URL-deduped) | Every 15 min | Rejected on hydrate if >30min, events >7 days pruned on merge |
| `sigint.ais.ship-cache.v1` | shipProvider | AIS vessel DataPoint[] | Every 300s | Rejected on hydrate if >30min |
| `sigint.firms.fire-cache.v1` | fireProvider | NASA FIRMS fire DataPoint[] (24h) | Every 600s | Rejected on hydrate if >30min |
| `sigint.noaa.weather-cache.v1` | weatherProvider | NOAA severe weather alert DataPoint[] | Every 300s | Rejected on hydrate if >30min |
| `sigint.trails.v1` | trailService | Map of entity ID → position history | Every 30s | Entries >24h removed at boot, 50 points/entity cap |
| `sigint.land.hd.v1` | landService | HD coastline polygon data | After first fetch | Never expires |
| `sigint.layout.v1` | PaneManager | Binary split tree layout + minimized panes | On every layout change | Never expires |
| `sigint.layout.presets.v1` | PaneManager | Named layout preset configurations | On save/update/delete | Never expires |
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

The provider has a two-tier cache: an in-memory object (`this.cache`) and IndexedDB via `storageService`. On boot, `hydrate()` checks memory first, then falls back to IndexedDB with staleness check. The in-memory cache is authoritative during a session; IndexedDB is for cross-session persistence.

When metadata enrichment succeeds, both tiers are updated and re-persisted. This means the cache progressively improves — a callsign that was "Unknown" on first fetch gains its real type, registration, and operator after enrichment, and that enriched data survives page reloads.

---

## Metadata Deduplication

`AircraftProvider` maintains two in-memory-only structures:

- **`metadataByIcao`** — Map of successfully resolved metadata
- **`attemptedMetadataIcao`** — Set of all ICAO24s ever attempted

On boot, `hydrate()` populates both from cached DataPoints where `acType ≠ "Unknown"`. During a session, `enrichAircraftByIcao24()` filters out already-attempted ICAO24s before hitting the server. This prevents redundant server calls across sessions.

---

## Ship Data Cache

Standard provider pattern. Server-side data is in-memory only (repopulates from aisstream.io WebSocket on restart). Client persists to IndexedDB, hydrates on boot with 30-min staleness.

---

## Trail Cache

Each trail point stores `{ lat, lon, ts, altitude?, speed?, heading? }`. The trail service records actual positions from each data refresh and uses speed + heading for between-refresh interpolation. Consumed for drawing trail lines behind selected items and for smoothly animating all moving points between refresh intervals. Trail recording is centralized in `DataContext` as a `useEffect` on `allData` changes, feeding both aircraft and ship positions to the trail service.

Entries purged after 3 consecutive missed refreshes (~12 minutes). Points capped at 50 per entity.

---

## IndexedDB Migration

On first run, `storageService` auto-migrates any existing localStorage data to IndexedDB and removes the old keys. One-time operation. IndexedDB has no practical size limit (browser-dependent, typically hundreds of MB to GB), eliminating the 5MB localStorage quota that previously caused trail persistence failures.