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
| `sigint.opensky.aircraft-cache.v1` | AircraftProvider | Full DataPoint[] with enriched metadata | Every 240s + after enrichment | Rejected on hydrate if >5min |
| `sigint.usgs.earthquake-cache.v1` | EarthquakeProvider | USGS earthquake DataPoint[] (7 days) | Every 420s | Rejected on hydrate if >30min |
| `sigint.trails.v1` | trailService | Map of entity ID → position history | Every 30s | Entries >24h removed at boot, 50 points/entity cap |
| `sigint.land.hd.v1` | landService | HD coastline polygon data | After first fetch | Never expires |
| `sigint.layout.v1` | PaneManager | Pane configs, split direction, sizes | On every layout change | Never expires |

---

## Aircraft Data Cache

The provider has a two-tier cache: an in-memory object (`this.cache`) and IndexedDB via `storageService`. On boot, `hydrate()` checks memory first, then falls back to IndexedDB. The in-memory cache is authoritative during a session; IndexedDB is for cross-session persistence.

When metadata enrichment succeeds, both tiers are updated and re-persisted. This means the cache progressively improves — a callsign that was "Unknown" on first fetch gains its real type, registration, and operator after enrichment, and that enriched data survives page reloads.

---

## Metadata Deduplication

`AircraftProvider` maintains two in-memory-only structures:

- **`metadataByIcao`** — Map of successfully resolved metadata
- **`attemptedMetadataIcao`** — Set of all ICAO24s ever attempted

On boot, `hydrate()` populates both from cached DataPoints where `acType ≠ "Unknown"`. During a session, `enrichAircraftByIcao24()` filters out already-attempted ICAO24s before hitting the server. This prevents redundant server calls across sessions.

---

## Trail Cache

Each trail point stores `{ lat, lon, ts, altitude?, speed?, heading? }`. The trail service records actual positions from each data refresh and uses speed + heading for between-refresh interpolation. Consumed for drawing trail lines behind selected items and for smoothly animating all moving points between 240-second refresh intervals.

Entries purged after 3 consecutive missed refreshes (~12 minutes). Points capped at 50 per entity.

---

## IndexedDB Migration

On first run, `storageService` auto-migrates any existing localStorage data to IndexedDB and removes the old keys. One-time operation. IndexedDB has no practical size limit (browser-dependent, typically hundreds of MB to GB), eliminating the 5MB localStorage quota that previously caused trail persistence failures.
