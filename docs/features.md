# Feature System

[← Back to Docs Index](./README.md)

**Related docs**: [Architecture](./architecture.md) · [Data Flow](./data-flow.md) · [Caching](./caching.md)

---

## Overview

Every data type in the application (aircraft, ships, events, quakes) is a **feature** — a self-contained module that implements the `FeatureDefinition` contract. This keeps rendering, filtering, and display logic colocated with the data type it belongs to.

Features are organized by domain: `tracking/` for live position feeds, `environmental/` for natural events, and `intel/` for news/conflict data.

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

| Directory | Purpose | Aircraft | Earthquake | Ships | Events |
|-----------|---------|----------|------------|-------|--------|
| `ui/` | React components | FilterControl, TickerContent | TickerContent | TickerContent | TickerContent |
| `hooks/` | React hooks | useAircraftData | useEarthquakeData | useShipData | useEventData |
| `data/` | Provider + fetching | AircraftProvider, typeLookup | EarthquakeProvider | ShipProvider | GdeltProvider |
| `lib/` | Pure utilities | filterUrl, utils | _(none yet)_ | _(none yet)_ | _(none yet)_ |
| _(root)_ | Config & types | index, types, definition, detailRows | index, types, definition, detailRows | index, types, definition, detailRows | index, types, definition, detailRows |

All external imports go through the barrel `index.ts` — never from subdirectories directly.

---

## DataPoint Union

`features/base/dataPoints.ts` imports each feature's data type from its own folder:

```typescript
type DataPoint =
  | (BasePoint & { type: "ships";    data: ShipData })
  | (BasePoint & { type: "aircraft"; data: AircraftData })
  | (BasePoint & { type: "events";   data: EventData })
  | (BasePoint & { type: "quakes";   data: EarthquakeData });
```

Every `BasePoint` carries `id`, `type`, `lat`, `lon`, and optional `timestamp`. The `data` field contains type-specific payload. `ShipData` and `EventData` are re-exported from `dataPoints.ts` for backward compatibility.

---

## Data Sources

| Source | Type | API | Status | Poll Interval |
|--------|------|-----|--------|---------------|
| OpenSky Network | Live aircraft positions | opensky-network.org/api/states/all | **Live** — client-side, anonymous, 400 cred/day | 240s |
| Aircraft metadata | Type/reg/operator lookup | Local ac-db.ndjson (~180k records) | **Live** — server-side | On selection |
| USGS Earthquakes | Seismic events (7 days) | earthquake.usgs.gov all_week.geojson | **Live** — client-side, free, no auth | 420s |
| GDELT 2.0 | Geolocated news events | data.gdeltproject.org raw export CSV | **Live** — server-side fetch + parse, token auth, client polls /api/events/latest | 15 min |
| AIS Ships | Live vessel positions | aisstream.io WebSocket | **Live** — server-side WebSocket stream, token auth, client polls /api/ships/latest | 300s (client) / real-time (server) |