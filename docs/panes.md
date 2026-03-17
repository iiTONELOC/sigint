# Pane System

[← Back to Docs Index](./README.md)

**Related docs**: [Architecture](./architecture.md) · [Data Flow](./data-flow.md) · [Caching](./caching.md) · [Rendering](./rendering.md)

---

## Overview

The application uses a multi-pane layout managed by `PaneManager`. App-level chrome (Header, Ticker) lives outside the pane system in `AppShell`. Each pane is an independent view of the shared data from `DataContext`.

---

## PaneManager

`panes/PaneManager.tsx` is the layout engine sitting between AppShell and the pane components.

### Layout

- CSS Grid with configurable direction (horizontal or vertical split)
- Fractional sizes per pane (sum to 1), stored as `number[]`
- Resize handles (4px) between panes — drag to resize with 15% minimum per pane
- Default layout: single globe pane, full screen

### Pane Operations

| Operation | Behavior |
|---|---|
| **Add** | `+` button opens menu of available pane types. Only types not already open are shown. |
| **Close** | X button removes the pane. Cannot close the last pane — falls back to default layout. |
| **Minimize** | Minus button collapses to a tab in the toolbar. Click tab to restore. |
| **Rearrange** | Chevron buttons in pane headers swap positions. |
| **Direction** | Toggle button switches between horizontal and vertical split. |
| **Resize** | Drag the handle between panes. Minimum 15% per pane. |

### Pane Types

| Type | Component | Limit | Description |
|---|---|---|---|
| `globe` | LiveTrafficPane | 1 | Interactive globe/map with all overlays |
| `data-table` | DataTablePane | 1 | Virtual-scrolling sortable/filterable table |
| `dossier` | DossierPane | 1 | Entity dossier — aircraft photos/route, ship details, event/quake/fire info |
| `intel-feed` | IntelFeedPane | 1 | Scrollable intel feed — GDELT events, quakes, fires with severity badges |

Each type can only appear once (no duplicate globes).

### Persistence

Layout state (pane configs, direction, sizes) is persisted to IndexedDB under key `sigint.layout.v2`. Restored on boot. Every layout change triggers a persist.

### Chrome Visibility

When `chromeHidden` is true, the PaneManager toolbar and pane headers are hidden alongside Header and Ticker. Only pane content remains visible.

---

## LiveTrafficPane

`panes/live-traffic/LiveTrafficPane.tsx` — the globe pane.

Reads everything from `useData()`. Only local state is `panelSide` (which side the detail panel renders on, driven by the globe's render loop with hysteresis).

Renders:

- `GlobeVisualization` — full-size Canvas 2D with Web Worker point rendering
- `DetailPanel` — auto-positions opposite selected item with 35%/65% hysteresis
- `LayerLegend` — bottom-left layer counts
- `StatusBadge` — bottom-right data source status

Passes `spatialGrid` and `filteredIds` from DataContext to GlobeVisualization for O(1) click/hover lookups.

All four overlays are gated on `chromeHidden` except the globe itself.

Selecting a data point stops auto-rotation, unhides chrome if hidden.

---

## DataTablePane

`panes/data-table/DataTablePane.tsx` — the data table pane.

### Virtual Scrolling

Only renders rows visible in the viewport plus 8 overscan rows. Fixed row height of 28px. Uses `ResizeObserver` to track viewport height. Even with 500+ items, only ~30-40 DOM nodes exist at any time.

### Columns

| Column | Key | Content |
|---|---|---|
| TYPE | `type` | Feature icon + abbreviation (AC, AIS, EVT, EQ) |
| NAME | `name` | Callsign, vessel name, headline, or location |
| CLS | `value1` | Aircraft type, vessel type, category, or magnitude |
| DTL | `value2` | Altitude, speed, source, or depth |
| LAT | `lat` | Latitude (2 decimal places) |
| LON | `lon` | Longitude (2 decimal places) |
| AGE | `age` | Relative age (LIVE, 5m, 2h, 3d) |
| — | zoom | Crosshair button — zooms to item on globe |

All columns are sortable (click header to toggle asc/desc).

### Filtering

Filter bar at top with per-feature type buttons. Shows counts per type. "ALL" button clears type filter.

Data is first filtered through each feature's `matchesFilter()` (respects layer toggles and aircraft filter), then optionally filtered by the selected type button.

### Cross-Pane Interaction

- Click a row → `setSelected(item)` — selects on globe, opens detail panel
- Click crosshair button → `setSelected(item)` + `setZoomToId(item.id)` — selects AND zooms to on globe
- Selected row is highlighted (synced with globe selection)
- **Auto-scroll**: When selection changes from an external source (ticker click, globe click), the table auto-scrolls to bring the selected row into view. If already visible, no scroll occurs.

---

## PaneHeader

`panes/PaneHeader.tsx` — thin header bar rendered above each pane.

Shows: feature icon + label, split right (Columns2) and split down (Rows2) buttons, minimize button, close button. Split buttons open a dropdown menu if multiple pane types are available, or split immediately if only one type is available. All buttons have 36px minimum touch targets (14px icons with padding).

Always shown (even on single pane) so split buttons are accessible.

---

## DossierPane

`panes/dossier/DossierPane.tsx` — entity dossier pane.

Shows enriched data for the currently selected entity. Content varies by type:

**Aircraft**: Photo from planespotters.net (direct URL per ToS, photographer credit with 8s load timeout), identity (hexdb.io aircraft info), live telemetry (altitude, speed, heading, squawk, V/S), route (hexdb.io callsign→ICAO origin/dest→airport details), intel links (FlightAware, FR24, ADS-B Exchange, Planespotters, JetPhotos).

**Ships**: MMSI, IMO, call sign, type, flag (derived from MMSI MID), destination, telemetry (SOG, COG, heading, nav status), dimensions, intel links (MarineTraffic, VesselFinder, Equasis).

**Events**: Actors, CAMEO code, Goldstein scale, mentions, sources, article link.

**Earthquakes**: Magnitude, depth, tsunami alert, felt reports, USGS detail link.

**Fires**: FRP (fire radiative power), brightness temperature, confidence level, satellite/instrument, detection time (day/night), pixel size, intel links (NASA FIRMS map, Google Maps satellite).

Server endpoint for aircraft: `/api/dossier/aircraft/:icao24?callsign=` — hexdb.io for aircraft info + route, planespotters.net for photos. Memory cache (30min text, 12h photos). Client-side IndexedDB cache under `sigint.dossier.cache.v2` (30min TTL, max 200 entries).

### Cross-Pane Signal

Uses `useSyncExternalStore` signal in `paneLayoutContext.ts` — NOT React context. PaneManager calls `setDossierOpen(bool)` in a `useEffect`. LiveTrafficPane reads via `useHasDossier()`. This hides DetailPanel when dossier pane is open.

---

## IntelFeedPane

`panes/intel-feed/IntelFeedPane.tsx` — scrollable intel feed pane.

Shows a chronological feed of intel-relevant data types: GDELT events, earthquakes, and fire hotspots. Aircraft and ships are excluded (they're position feeds, not event-driven).

### Features

- Sorted newest-first by timestamp
- Severity badges (MON/CON/TEN/CON/CRI) with color-coded styling
- Per-type filter buttons (events, quakes, fires) with counts
- Source attribution and location context
- External link buttons for events with source URLs
- Zoom-to button per item — selects + zooms on globe
- Click any item to select (syncs with globe + data table)

### Severity Mapping

| Type | Input | Severity 1 | Severity 3 | Severity 5 |
|---|---|---|---|---|
| Events | Goldstein scale | Monitoring | Tension | Crisis |
| Quakes | Magnitude | <M3 | M4-5 | M6+ |
| Fires | FRP (MW) | <5 | 20-50 | 100+ |

---

## Mobile Layout

Under 768px, PaneManager switches to single-pane mode with tab switching. Mobile-specific adaptations:

- Tab buttons and add-pane button have 40px minimum touch targets
- Add-pane button positioned before the flex spacer (always visible, not pushed off-screen)
- Add-pane dropdown items have 44px minimum touch targets
- Detail panel renders as a compact bottom sheet (28vh max) with a drag handle affordance