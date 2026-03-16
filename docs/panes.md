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

Each type can only appear once (no duplicate globes).

### Persistence

Layout state (pane configs, direction, sizes) is persisted to IndexedDB under key `sigint.layout.v1`. Restored on boot. Every layout change triggers a persist.

### Chrome Visibility

When `chromeHidden` is true, the PaneManager toolbar and pane headers are hidden alongside Header and Ticker. Only pane content remains visible.

---

## LiveTrafficPane

`panes/live-traffic/LiveTrafficPane.tsx` — the globe pane.

Reads everything from `useData()`. Only local state is `panelSide` (which side the detail panel renders on, driven by the globe's render loop).

Renders:

- `GlobeVisualization` — full-size Canvas 2D
- `DetailPanel` — auto-positions opposite selected item
- `LayerLegend` — bottom-left layer counts
- `StatusBadge` — bottom-right data source status

All four are gated on `chromeHidden` except the globe itself.

Clicking a data point while chrome is hidden selects it AND unhides chrome.

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

---

## PaneHeader

`panes/PaneHeader.tsx` — thin header bar rendered above each pane when multiple panes are open.

Shows: feature icon + label, move left/right chevrons, minimize button, close button. Direction-aware (chevrons show left/right for horizontal, up/down for vertical).

Not shown when only one pane is open and nothing is minimized.