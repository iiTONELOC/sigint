# Feature System

[← Back to Docs Index](./README.md)

**Related docs**: [Architecture](./architecture.md) · [Data Flow](./data-flow.md) · [Caching](./caching.md)

---

## Overview

Every data type in the application (aircraft, ships, events, quakes, fires) is a **feature** — a self-contained module that implements the `FeatureDefinition` contract. This keeps rendering, filtering, and display logic colocated with the data type it belongs to.

Features are organized by domain: `tracking/` for live position feeds, `environmental/` for natural events (earthquakes, fires), and `intel/` for news/conflict data.

---

## FeatureDefinition Contract

Defined in `features/base/types.ts`:

```typescript
type FeatureDefinition<TData, TFilter> = {
  id: string;                   // Discriminator matching DataPoint.type
  label: string;                // Display name ("AIRCRAFT", "AIS VESSELS")
  icon: LucideIcon;             // Icon component for UI

  matchesFilter(item, filter): boolean;   // Does this item pass the current filter?
  defaultFilter: TFilter;                 // Initial filter state

  buildDetailRows(data, timestamp?): [string, string][];  // Detail panel rows + intel links
  TickerContent: React.ComponentType;     // How this type renders in the ticker

  FilterControl?: React.ComponentType;    // Optional header filter UI
  getSearchText?: (data) => string;       // Optional searchable text builder
};
```

---

## Feature Registry

`features/registry.tsx` is a pure registry file — imports all definitions, exports two collections:

- **`featureList`** — ordered array for iteration (determines UI rendering order)
- **`featureRegistry`** — `Map<string, FeatureDefinition>` for O(1) lookup by id

Consumed by uiSelectors, pointWorker.js (rendering logic inlined), tickerFeed, Search, DataTablePane, Header toggles, LayerLegend.

---

## Feature Structure

Every feature uses an explicit subdirectory layout. All live features have the full set.

| Directory | Purpose | Aircraft | Earthquake | Ships | Events | Fires | Weather |
|-----------|---------|----------|------------|-------|--------|-------|---------|
| `ui/` | React components | FilterControl, TickerContent | TickerContent | TickerContent | TickerContent | TickerContent | TickerContent |
| `hooks/` | React hooks | useAircraftData | useEarthquakeData | useShipData | useEventData | useFireData | useWeatherData |
| `data/` | Provider + fetching | AircraftProvider (class), typeLookup | earthquakeProvider (BaseProvider) | shipProvider (BaseProvider) | gdeltProvider (BaseProvider, mergeFn) | fireProvider (BaseProvider) | weatherProvider (BaseProvider) |
| `lib/` | Pure utilities | filterUrl, utils | _(none)_ | _(none)_ | _(none)_ | _(none)_ | _(none)_ |
| _(root)_ | Config & types | index, types, definition, detailRows | index, types, definition, detailRows | index, types, definition, detailRows | index, types, definition, detailRows | index, types, definition, detailRows | index, types, definition, detailRows |

All external imports go through the barrel `index.ts` — never from subdirectories directly.

### BaseProvider (DRY Base Class)

The 5 non-aircraft providers share a common `BaseProvider` class (`features/base/BaseProvider.ts`) that handles all caching boilerplate: `persistCache`, `readPersistedCache`, `hydrate`, `refresh` (with error fallback), and `getData` (poll-aware background refresh). Each provider only supplies a config object: `id`, `cacheKey`, `maxCacheAgeMs`, `fetchFn()`, and optional `mergeFn()` (used by GDELT for URL-based dedup and 7-day rolling window pruning).

Similarly, the 5 non-aircraft hooks are thin wrappers around `useProviderData` (`features/base/useProviderData.ts`), which handles state, hydration, polling, and data source status resolution. Fire and ship hooks pass a custom `resolveDataSource` callback for 503→`"unavailable"` logic.

The aircraft provider remains a standalone class due to its unique requirements: client-side OpenSky fetch, metadata enrichment, `fetchInProgress` dedup, and mock data fallback.

---

## DataPoint Union

`features/base/dataPoints.ts` imports each feature's data type from its own folder:

```typescript
type DataPoint =
  | (BasePoint & { type: "ships";    data: ShipData })
  | (BasePoint & { type: "aircraft"; data: AircraftData })
  | (BasePoint & { type: "events";   data: EventData })
  | (BasePoint & { type: "quakes";   data: EarthquakeData })
  | (BasePoint & { type: "fires";    data: FireData })
  | (BasePoint & { type: "weather";  data: WeatherData });
```

Every `BasePoint` carries `id`, `type`, `lat`, `lon`, and optional `timestamp`. The `data` field contains type-specific payload. `ShipData`, `EventData`, and `FireData` are re-exported from `dataPoints.ts` for backward compatibility.

---

## Military Aircraft Classification

Aircraft are classified as military via a heuristic system in `server/api/aircraftMetadata.ts`. Three signals are checked against the `ac-db.ndjson` database:

1. **ICAO type codes** — 50+ known military type designators (F-16, C-17, KC-135, MQ-9, etc.)
2. **Operator keywords** — 15 military operator strings (Air Force, Navy, Marines, Army, RAF, etc.)
3. **US DoD ICAO24 hex range** — AE0000–AFFFFF (US military block)

Any match sets `military: true` on the `AircraftMetadata` response. ~15,700 aircraft flagged across ~616K records.

**Client-side flow**: `AircraftData` type includes `military: boolean`. The aircraft filter has a `milFilter` field (`"all" | "mil" | "civ"`). Filter URL syncs milFilter to query params.

**Rendering**: Military aircraft render in orange-red (`#ff6644`) with higher alpha and larger triangles in `pointWorker.js`. MIL badge shows in the ticker and dossier. Emergency squawk alerts include "MIL" prefix for military aircraft. The correlation engine uses military classification for the "military aircraft near conflict zone" cross-source rule.

---

## Data Sources

| Source | Type | Fetch | Poll |
|--------|------|-------|------|
| OpenSky Network | Live aircraft positions | Client-side, anonymous | 240s |
| Aircraft metadata | Type/reg/operator lookup | Server-side, local NDJSON | On selection |
| USGS Earthquakes | Seismic events (7 days) | Client-side, no auth | 420s |
| GDELT 2.0 | Geolocated news events | Server-side, token auth | 15 min |
| AIS Ships | Live vessel positions | Server WebSocket, token auth | 300s |
| NASA FIRMS | Fire hotspots (24h) | Server-side, token auth | 600s |
| NOAA Weather | Severe weather alerts (US) | Client-side, no auth | 300s |
| RSS News | World news articles | Server-side, token auth | 600s |

### Non-Feature Data Sources

Not all data sources are features. Two pane types operate entirely outside the feature system:

**RSS News** (`panes/news-feed/`): Non-geographic (no lat/lon). Does NOT use FeatureDefinition, DataPoint union, feature registry, or BaseProvider. Has its own provider class (`NewsProvider`) that mirrors BaseProvider's API surface. Own hook (`useNewsData`) following `useProviderData` pattern. Hook called in `DataContext`, `newsArticles` exposed on context value. Consumed by `NewsFeedPane` via `useData()` and by the correlation engine for news linking.

**Video Feed** (`panes/video-feed/`): Not a data source at all — plays live HLS video streams from the iptv-org community channel directory. No data pipeline, no provider, no hook. Self-contained pane with its own channel service, persistence, and preset system. Depends on `hls.js` (Apache 2.0).