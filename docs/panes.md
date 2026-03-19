# Pane System

[← Back to Docs Index](./README.md)

**Related docs**: [Architecture](./architecture.md) · [Data Flow](./data-flow.md) · [Caching](./caching.md) · [Rendering](./rendering.md)

---

## Overview

The application uses a multi-pane layout managed by `PaneManager`. App-level chrome (Header, Ticker) lives outside the pane system in `AppShell`. Each pane is an independent view of the shared data from `DataContext`.

---

## PaneManager

`panes/PaneManager.tsx` is the layout engine sitting between AppShell and the pane components.

### Layout — Binary Split Tree

The layout is a recursive binary split tree. Each node is either a leaf (renders a pane) or a split (two children with a direction and ratio):

```typescript
type LeafNode = { type: "leaf"; id: string; paneType: PaneType };
type SplitNode = { type: "split"; id: string; direction: "h" | "v"; ratio: number; children: [LayoutNode, LayoutNode] };
type LayoutNode = LeafNode | SplitNode;
type LayoutState = { root: LayoutNode; minimized: { id: string; paneType: PaneType }[] };
```

Split nodes render as CSS Grid with `gridTemplateColumns` (horizontal) or `gridTemplateRows` (vertical) using fractional units. A 4px `ResizeHandle` sits between children.

- Default layout: single globe pane, full screen

### Pane Operations

| Operation | Behavior |
|---|---|
| **Split H / Split V** | Wraps the current leaf in a split node with a new pane as sibling. If only one type available, splits immediately; otherwise opens a dropdown menu. |
| **Close** | X button removes the pane via `removeLeaf()`, promotes sibling. Cannot close the last pane — falls back to default layout. |
| **Minimize** | Minus button records the pane's parent split direction, ratio, side (wasSecond), and sibling ID, then collapses to a tab in the toolbar. Click tab to restore at the exact original position (finds sibling in tree, re-inserts). Falls back to root if sibling was removed. |
| **Change Type** | Click pane title → dropdown of all other pane types → swaps in place via `replaceNode()`. |
| **Drag to Swap** | Drag grip handle on pane header → drop on another pane's header → `swapPanes()` performs a 3-step placeholder tree-position swap (source→placeholder, target→source, placeholder→target). Leaf nodes physically move in the tree — no content swap. React keys are based on `paneType` for stable unmount/remount. |
| **Resize** | Drag the handle between split children. Min ratio 0.1, max 0.9. Visual indicator line during drag. |
| **Layout Presets** | VIEWS button in PaneManager toolbar opens `LayoutPresetMenu`. Save current layout as a named preset, load a saved preset, update an existing preset (pencil icon overwrites with current layout), or delete. Persisted to `sigint.layout.presets.v1`. |

### Pane Types

| Type | Component | Limit | Description |
|---|---|---|---|
| `globe` | LiveTrafficPane | 1 | Interactive globe/map with all overlays |
| `data-table` | DataTablePane | 1 | Virtual-scrolling sortable/filterable table |
| `dossier` | DossierPane | 1 | Entity dossier — aircraft photos/route, ship details, event/quake/fire info |
| `intel-feed` | IntelFeedPane | 1 | Scrollable intel feed — GDELT events, quakes, fires with severity badges |
| `alert-log` | AlertLogPane | 1 | Priority alerts — emergency squawks, high-FRP fires, severe weather, crisis events. Filter by type, sort by time/priority. |
| `raw-console` | RawConsolePane | 1 | Raw data console — JSON view of incoming data streams |
| `video-feed` | VideoFeedPane | 1 | Live HLS video streams — iptv-org news channels, grid layout, presets |

Each type can only appear once (no duplicate globes).

### Persistence

Layout state (pane configs, split tree, ratios) is persisted under key `sigint.layout.v1`. Restored on boot. Every layout change triggers a persist. Invalid or corrupt layouts fall back to default (single globe pane).

### Dossier Open Bridge

`panes/paneLayoutContext.ts` provides a cross-component event system using `useSyncExternalStore`:

- `setDossierOpen(bool)` — PaneManager signals whether a dossier pane exists in the tree
- `useHasDossier()` — LiveTrafficPane reads to decide whether to show DetailPanel
- `requestDossierOpen()` — DetailPanel fires this to ask PaneManager to add a dossier pane
- `onDossierOpenRequest(cb)` — PaneManager listens and auto-splits the globe pane with a dossier at 75/25 ratio

The listener uses `setLayout((prev) => ...)` functional form to avoid stale closures.

### Chrome Visibility

When `chromeHidden` is true, the PaneManager toolbar and pane headers are hidden alongside Header and Ticker. Only pane content remains visible.

---

## LiveTrafficPane

`panes/live-traffic/LiveTrafficPane.tsx` — the globe pane.

Reads everything from `useData()`. Only local state is `panelSide` (which side the detail panel renders on, driven by the globe's render loop with hysteresis).

Renders:

- `GlobeVisualization` — full-size Canvas 2D with Web Worker point rendering
- `DetailPanel` — auto-positions opposite selected item with 35%/65% hysteresis. LOCATE button zooms to selected entity on demand (no auto-zoom on Focus/Solo toggle). Shows "OPEN IN DOSSIER" button when no dossier pane is open (fires `requestDossierOpen()`); shows intel links when dossier IS open. Two-row toolbar: icon + title + close X on top row, LOCATE/FOCUS/SOLO buttons on second row.

Passes `spatialGrid` and `filteredIds` from DataContext to GlobeVisualization for O(1) click/hover lookups.

All overlays are gated on `chromeHidden` except the globe itself.

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

All columns are sortable (click header to toggle asc/desc). Each column header has a descriptive tooltip.

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

Shows: drag grip handle (GripVertical, left), clickable label with chevron (opens pane type dropdown for in-place swap), split right (Columns2) and split down (Rows2) buttons, minimize button, close button. All buttons have 36px minimum touch targets. Drop target highlight shows accent border when another pane is being dragged over.

---

## DossierPane

`panes/dossier/DossierPane.tsx` — entity dossier pane.

Shows enriched data for the currently selected entity. Content varies by type:

**Aircraft**: Photo from planespotters.net (direct URL per ToS, photographer credit with 8s load timeout), identity (hexdb.io aircraft info), live telemetry (altitude, speed, heading, squawk, V/S), route (hexdb.io callsign→ICAO origin/dest→airport details), intel links (FlightAware, FR24, ADS-B Exchange, Planespotters, JetPhotos).

**Ships**: MMSI, IMO, call sign, type, flag (derived from MMSI MID), destination, telemetry (SOG, COG, heading, nav status), dimensions, intel links (MarineTraffic, VesselFinder, Equasis).

**Events**: Headline, category, severity, tone, source, origin country, location, article link.

**Earthquakes**: Magnitude, depth, tsunami alert, felt reports, USGS detail link.

**Fires**: FRP (fire radiative power), brightness temperature, confidence level, satellite/instrument, detection time (day/night), pixel size, intel links (NASA FIRMS map, Google Maps satellite).

**Weather**: Severity, event type, area description, onset/expiry, headline.

Server endpoint for aircraft: `/api/dossier/aircraft/:icao24?callsign=` — hexdb.io for aircraft info + route, planespotters.net for photos. Memory cache (30min text, 12h photos). Client-side IndexedDB cache under `sigint.dossier.cache.v1` (30min TTL, max 200 entries).

Dossier toolbar is two-row responsive: row 1 has icon + title + close X, row 2 has LOCATE/FOCUS/SOLO buttons with full text labels (IsoBtn). LOCATE zooms to the entity on demand. "Open in Dossier" from DetailPanel checks the minimized array first and restores at original position instead of creating a new pane.

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

## AlertLogPane

`panes/alert-log/AlertLogPane.tsx` — priority alerts pane.

`extractAlerts()` scans `allData` for notable items within the last 24 hours:

- Aircraft with emergency squawk codes (7700 emergency, 7500 hijack = priority 10; 7600 radio failure = priority 9)
- GDELT events with severity ≥ 4 (crisis = priority 8, conflict = priority 6)
- Earthquakes with magnitude ≥ 4.5 (M6+ = priority 9, M5+ = 7, M4.5+ = 5); tsunami bonus
- Fire hotspots with FRP ≥ 50 MW (FRP 100+ = priority 7, FRP 50+ = 5)
- Severe/Extreme weather alerts (Extreme = priority 8, Severe = 6)

### Features

- **Filter tabs** at top — per-type buttons with icons and counts. Click to filter, click again for all.
- **Sort toggle** — ⏱ NEW (newest first, default) or ⚡ PRI (highest priority first, then by time)
- **Priority color coding** — red left border for priority ≥ 8, yellow for ≥ 5, accent for lower
- **Virtual scrolling** — ROW_HEIGHT 56px, OVERSCAN 6 rows. Scroll resets on filter/sort change.
- **Cross-pane interaction** — click to select, locate button zooms to item on globe

---

## VideoFeedPane

`panes/video-feed/VideoFeedPane.tsx` — live HLS video streams.

Uses **HLS.js** (Apache 2.0 license) to play `.m3u8` streams from the **iptv-org** community channel directory (`iptv-org.github.io/api/streams.json` + `channels.json`). No iframes — direct `<video>` element playback.

### Features

- **Grid layouts**: 1×1, 2×2, 3×3 toggle via toolbar
- **Channel picker**: search + region tabs (ALL, ★ TOP, US, AMER, EUR, MENA, ASIA, AFR, OCE)
- **Virtual-scrolled channel list** — full ~3K channels, no cap
- **Featured channels** pinned to top: Al Jazeera, Sky News, BBC, CNN, Fox, C-SPAN, PBS, NewsMax, Bloomberg, etc.
- **Error recovery**: RETRY / CHANGE / CLOSE buttons on stream failure, 15s load timeout, max 2 retries
- **Audio**: only one slot unmuted at a time
- **Auto-save**: grid layout + channel selections persist to `sigint.videofeed.state.v1`. Restored on mount.
- **Presets**: bookmark icon in toolbar → save/load/delete named channel configurations. Pencil icon on each preset overwrites with current grid + channels (no delete + recreate needed). Stored under `sigint.videofeed.presets.v1`.

**Dependency**: `bun add hls.js` required.

---

## RawConsolePane

`panes/raw-console/RawConsolePane.tsx` — raw data console pane.

Shows a raw JSON view of incoming data streams for debugging and monitoring.

---

## Mobile Layout

Under 768px, PaneManager switches to single-pane mode with tab switching. Mobile-specific adaptations:

- Scroll-snap tab bar with `min-h-8` touch targets, cyan bottom-bar active indicator
- Close button (X) on active tab when multiple panes open
- Mobile status bar above tab bar showing track count + source status (replaces desktop globe pane header info)
- Layer toggles go icon-only (no count label) below `sm` breakpoint with tighter gaps/padding
- On `lg:` and up, Header renders as a single row (logo + search + toggles + aircraft filter + clock). Below `lg`, two-row layout (logo+clock / toggles centered).
- Detail panel renders as a bottom sheet (`max-h-[40vh]`) with `useSheetDismiss` hook — touch drag to dismiss with velocity detection (>80px or >0.5 px/ms). Snaps back on insufficient drag. Wider drag handle.
- Detail panel on desktop: `max-h-[calc(100%-28px)] overflow-y-auto sigint-scroll` — scrolls when content exceeds pane height.
- Add-pane button positioned before the flex spacer (always visible, not pushed off-screen)
- Add-pane dropdown items have 44px minimum touch targets