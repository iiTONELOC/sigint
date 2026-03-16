# Data Flow

[← Back to Docs Index](./README.md)

**Related docs**: [Architecture](./architecture.md) · [Feature System](./features.md) · [Caching](./caching.md) · [Pane System](./panes.md)

---

## Shared Data Context

All application state lives in `context/DataContext.tsx`, exposed via the `useData()` hook. The context provider calls the data hooks (`useAircraftData`, `useEarthquakeData`, `useEventData`), merges their output into `allData`, and computes all derived values. Every component — Header, PaneManager, LiveTrafficPane, DataTablePane, Ticker — reads from this single context.

### What lives in DataContext

| Category | State | Purpose |
|---|---|---|
| **Raw data** | `allData` | Merged aircraft + mock ships + earthquake + GDELT event DataPoints |
| **Selection** | `selected`, `selectedCurrent`, `setSelected` | Currently selected item (selectedCurrent stays fresh across data refreshes) |
| **Isolation** | `isolateMode`, `setIsolateMode` | FOCUS (layer only) or SOLO (single point) |
| **Layers** | `layers`, `toggleLayer` | Per-feature on/off toggles |
| **Aircraft filter** | `aircraftFilter`, `setAircraftFilter` | Complex filter (squawks, countries, airborne/ground) |
| **Filters** | `filters` | Unified filter map consumed by uiSelectors |
| **Derived** | `counts`, `activeCount`, `tickerItems`, `availableCountries`, `dataSources` | Computed via useMemo |
| **View controls** | `flat`, `autoRotate`, `rotationSpeed` + setters | Globe-specific but toggled from Header |
| **Chrome** | `chromeHidden`, `setChromeHidden` | Toggle all UI overlays |
| **Search** | `searchMatchIds`, `handleSearchMatchIds`, `handleSearchSelect`, `handleSearchZoomTo` | Search filter + zoom |
| **Zoom** | `zoomToId`, `setZoomToId` | Triggers camera zoom-to |
| **Enrichment** | `requestAircraftEnrichment` | On-demand metadata lookup |

### Derived values

| Derived | Recomputes when |
|---|---|
| `allData` | Any hook's data changes |
| `dataSources` | Any hook's dataSource status changes |
| `filters` | `aircraftFilter` or `layers` changes |
| `tickerItems` | Data refresh or filter change |
| `selectedCurrent` | Data refresh or selection change |
| `counts` | Data refresh or filter change |
| `activeCount` | Data refresh or filter change |
| `availableCountries` | Data refresh |

`selectedCurrent` is notable: when data refreshes, the previously selected item's `DataPoint` object is replaced by a new one with the same `id`. `selectedCurrent` finds the updated version so the detail panel always shows fresh data.

---

## Boot & Polling Lifecycle

```mermaid
flowchart TD
    Boot["Application Boot<br/>await cacheInit()"] --> HydrateAC["AircraftProvider.hydrate()<br/>(rejects if >5min stale)"]
    Boot --> HydrateEQ["EarthquakeProvider.hydrate()<br/>(rejects if >30min stale)"]
    Boot --> HydrateEV["GdeltProvider.hydrate()<br/>(rejects if >30min stale)"]

    HydrateAC -->|"cache hit"| MergeCache["cached aircraft + mock ships"]
    HydrateAC -->|"cache miss"| MockFallback["mock aircraft + mock ships"]

    HydrateEQ -->|"cache hit"| CachedEQ["cached earthquakeData"]
    HydrateEQ -->|"cache miss"| EmptyEQ["earthquakeData = []"]

    HydrateEV -->|"cache hit"| CachedEV["cached eventData"]
    HydrateEV -->|"cache miss"| EmptyEV["eventData = []"]

    MergeCache --> AllData["allData = useMemo merge"]
    MockFallback --> AllData
    CachedEQ --> AllData
    EmptyEQ --> AllData
    CachedEV --> AllData
    EmptyEV --> AllData

    AllData --> PollAC["Aircraft poll() every 240s"]
    AllData --> PollEQ["Earthquake poll() every 420s"]
    AllData --> PollEV["Event poll() every 15 min<br/>(fetches from our server)"]

    PollAC -->|"success"| PersistAC["persistCache() → IndexedDB"]
    PollEQ -->|"success"| PersistEQ["persistCache() → IndexedDB"]
    PollEV -->|"success"| PersistEV["mergeAndPrune() → persistCache() → IndexedDB"]

    PersistAC --> SetState["React state update → re-merge allData"]
    PersistEQ --> SetState
    PersistEV --> SetState
```

All three hooks skip the immediate fetch on boot if hydration returned fresh data, reducing unnecessary API/server calls during development.

---

## The `allData` Array

`allData` is the **single source of truth** for all renderable points:

```typescript
const { data: aircraftAndMockData } = useAircraftData();
const { data: earthquakeData } = useEarthquakeData();
const { data: eventData } = useEventData();

const allData = useMemo(
  () => [...aircraftAndMockData, ...earthquakeData, ...eventData],
  [aircraftAndMockData, earthquakeData, eventData],
);
```

- **`aircraftAndMockData`**: Live aircraft from OpenSky (refreshed every 240s) + static mock ships (generated once on mount via `useRef`).
- **`earthquakeData`**: Live earthquakes from USGS (refreshed every 420s). Covers the past 7 days of global seismic activity.
- **`eventData`**: Live GDELT events from our server (refreshed every 15 min). Client-side 7-day rolling window with URL-based dedup. Server fetches GDELT raw export files, parses geocoded conflict/crisis events, caches in memory.

---

## The `filters` Map

```typescript
const filters = {
  aircraft: aircraftFilter,  // AircraftFilter object
  ships:    layers.ships,     // boolean
  events:   { enabled: layers.events ?? true, minSeverity: 0 },  // EventFilter
  quakes:   { enabled: layers.quakes ?? true, minMagnitude: 0 },  // EarthquakeFilter
};
```

Each feature's `matchesFilter()` receives its corresponding filter value. Aircraft uses a complex filter object with squawk/country/airborne toggles. Earthquake uses `EarthquakeFilter` with enabled + minMagnitude. Events use `EventFilter` with enabled + minSeverity. Ships use a simple boolean.

---

## GDELT Event Data Flow

The GDELT pipeline has both server-side and client-side components:

**Server** (`gdeltCache.ts`): Every 15 minutes, fetches `lastupdate.txt` from GDELT, downloads the latest `.export.CSV.zip`, extracts and parses the tab-delimited CSV, filters to conflict/crisis CAMEO codes, converts to GeoJSON, and caches in memory. Serves via `/api/events/latest` with token auth.

**Client** (`GdeltProvider`): Polls `/api/events/latest` every 15 minutes using `authenticatedFetch()` from `lib/authService.ts`, which handles token acquisition and auto-refresh. Incoming events are merged with existing cache (URL-based dedup), events older than 7 days are pruned, and the result is persisted to IndexedDB.

---

## Enrichment Pipeline

Aircraft metadata enrichment runs as a side effect in `DataContext`, scoped to the currently selected aircraft only (prevents cache bloat).

```mermaid
flowchart TD
    Trigger["useEffect: selectedCurrent changes"] --> Check{"type === aircraft?"}
    Check -->|"no"| Skip
    Check -->|"yes"| Dedup{"icao24 === lastEnrichmentKeyRef?"}
    Dedup -->|"yes"| Skip
    Dedup -->|"no"| Call["requestAircraftEnrichment([icao24])"]
    Call --> Provider["AircraftProvider.enrichAircraftByIcao24()"]
    Provider --> Server["GET /api/aircraft/metadata/batch"]
    Server --> Apply["applyMetadata() → re-persist → setData()"]
```