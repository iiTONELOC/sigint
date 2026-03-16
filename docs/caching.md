# Caching Architecture

[← Back to Docs Index](./README.md)

**Related docs**: [Data Flow](./data-flow.md) · [Constraints](./constraints.md) · [Pane System](./panes.md)

---

## Overview

The application uses a unified IndexedDB-backed storage service (`lib/storageService.ts`) for all persistent caching. On first run it auto-migrates any existing localStorage data. All reads are synchronous from an in-memory Map (populated at boot via `await cacheInit()`), while writes go to IndexedDB asynchronously (fire-and-forget) to avoid blocking the render loop.

At boot, `cacheInit()` runs a cleanup pass: trail entries older than 24 hours are removed, and trail points are capped at 50 per entity (~3.3 hours at 4-minute intervals) to prevent unbounded growth.

**Every live data provider follows the same caching pattern**: hydrate from IndexedDB on boot (with staleness rejection), persist after every successful fetch, and fall back through memory cache → IndexedDB cache → empty on error.

---

## Cache Keys

| Key | Owner | Contains | Written | Staleness |
|---|---|---|---|---|
| `sigint.opensky.aircraft-cache.v1` | AircraftProvider | Full DataPoint[] with enriched metadata | Every 240s + after enrichment | Rejected on hydrate if >235s |
| `sigint.usgs.earthquake-cache.v1` | EarthquakeProvider | USGS earthquake DataPoint[] (7 days) | Every 420s | Rejected on hydrate if >30min |
| `sigint.gdelt.events-cache.v1` | GdeltProvider | GDELT event DataPoint[] (7-day rolling window, URL-deduped) | Every 15 min | Rejected on hydrate if >30min, events >7 days pruned on merge |
| `sigint.ais.ship-cache.v1` | ShipProvider | AIS vessel DataPoint[] | Every 300s | Rejected on hydrate if >5min |
| `sigint.trails.v1` | trailService | Map of entity ID → position history | Every 30s | Entries >24h removed at boot, 50 points/entity cap |
| `sigint.land.hd.v1` | landService | HD coastline polygon data | After first fetch | Never expires |
| `sigint.layout.v1` | PaneManager | Pane configs, split direction, sizes | On every layout change | Never expires |

---

## Staleness & Hydration

Each provider's hydration staleness threshold is set so that stale cache is rejected and the hook's immediate fetch fires rather than waiting a full poll interval with old data:

| Provider | Poll Interval | Staleness Threshold | Rationale |
|---|---|---|---|
| Aircraft | 240s | 235s | Slightly under poll interval — cache from the previous cycle is too old |
| Earthquake | 420s | 30 min | USGS feed updates every 5 min, 30 min is generous but acceptable for seismic data |
| Events | 15 min | 30 min | GDELT updates every 15 min, 30 min allows one missed cycle |
| Ships | 300s | 5 min | AIS data is high-frequency; stale ship positions are misleading |

When hydration rejects (returns null), the hook starts with empty/mock data and fetches immediately. When hydration succeeds (cache is fresh), the hook skips the immediate fetch and waits for the next poll interval — the cached data is shown instantly as a placeholder.

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

The `ShipProvider` follows the standard provider pattern. Server-side, vessel data is never persisted — the in-memory Map is populated in real-time from the aisstream.io WebSocket and repopulates within seconds of a server restart. Client-side, the provider persists to IndexedDB after each successful poll and hydrates on boot with a 5-minute staleness threshold.

---

## Trail Cache

Each trail point stores `{ lat, lon, ts, altitude?, speed?, heading? }`. The trail service records actual positions from each data refresh and uses speed + heading for between-refresh interpolation. Consumed for drawing trail lines behind selected items and for smoothly animating all moving points between refresh intervals. Trail recording is centralized in `DataContext` as a `useEffect` on `allData` changes, feeding both aircraft and ship positions to the trail service.

Entries purged after 3 consecutive missed refreshes (~12 minutes). Points capped at 50 per entity.

---

## IndexedDB Migration

On first run, `storageService` auto-migrates any existing localStorage data to IndexedDB and removes the old keys. One-time operation. IndexedDB has no practical size limit (browser-dependent, typically hundreds of MB to GB), eliminating the 5MB localStorage quota that previously caused trail persistence failures.