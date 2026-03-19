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
| **Drag to Move** | Drag grip handle on pane header → drop on another pane's header → `movePaneToTarget()` removes source from its original position (collapses parent split), then splits the source beside the drop target as a new horizontal split (50/50). Target stays in place, source's original position is freed. |
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
| `news-feed` | NewsFeedPane | 1 | RSS news feed — 6 world news sources, source filters, inline article detail |

Each type can only appear once (no duplicate globes).

### Persistence

Layout state (pane configs, split tree, ratios) is persisted under key `sigint.layout.v1`. Restored on boot. Every layout change triggers a persist. Invalid or corrupt layouts fall back to default (single globe pane).

### Dossier Open Bridge

`panes/paneLayoutContext.ts` provides a cross-component event system using `useSyncExternalStore`:

- `setDossierOpen(bool)` — PaneManager signals whether a dossier pane exists in the tree
- `useHasDossier()` — LiveTrafficPane reads to decide whether to show DetailPanel
- `requestDossierOpen()` — DetailPanel fires this to ask PaneManager to add a dossier pane
- `onDossierOpenRequest(cb)` — PaneManager listens and auto-splits the globe pane with a dossier at 75/25 ratio

### Watch Layout Bridge

Same event system, separate channel:

- `requestWatchLayout()` — DataContext fires this when watch starts and every 3s during active watch
- `onWatchLayoutRequest(cb)` — PaneManager listens and ensures dossier + alert-log + intel-feed panes exist. `ensurePane` scans the current tree by pane type on each call. Missing panes are created with defined anchor relationships: dossier right of globe (75/25), alerts below globe (65/35), intel right of alerts (50/50). Closed panes during watch are re-created within 3 seconds.

Both listeners use `setLayout((prev) => ...)` functional form to avoid stale closures.

### Chrome Visibility

When `chromeHidden` is true, the PaneManager toolbar and pane headers are hidden alongside Header and Ticker. Only pane content remains visible.

---

## LiveTrafficPane

`panes/live-traffic/LiveTrafficPane.tsx` — the globe pane.

Reads everything from `useData()`. Local state: `panelSide` (which side the detail panel renders on), `watchMenuOpen` (WATCH dropdown visibility).

Renders:

- `GlobeVisualization` — full-size Canvas 2D with Web Worker point rendering
- **View controls overlay** (top-left): FLAT/GLOBE toggle, ROT toggle (default paused), WATCH button (dropdown: ALERTS/INTEL/ALL, pause/resume/stop states), SPD slider, watch counter
- `DetailPanel` — auto-positions opposite selected item with 35%/65% hysteresis. LOCATE button zooms to selected entity on demand (no auto-zoom on Focus/Solo toggle). Shows "OPEN IN DOSSIER" button when no dossier pane is open (fires `requestDossierOpen()`); shows intel links when dossier IS open. Two-row toolbar: icon + title + close X on top row, LOCATE/FOCUS/SOLO buttons on second row.

### Watch Controls (Globe Overlay)

Three visual states:

| State | Button | Additional UI |
|---|---|---|
| **Inactive** | 👁 WATCH → click opens dropdown (ALERTS / INTEL / ALL) | — |
| **Active** | ⏸ WATCH → click pauses | Counter badge: "18/116 · ALERTS" |
| **Paused** | ▶ RESUME + ✕ stop | Yellow "PAUSED 18/116 · ALERTS" badge |

Watch menu closes on outside click. During active watch, globe rotation is enabled automatically.

Passes `spatialGrid`, `filteredIds`, `revealId` from DataContext to GlobeVisualization.

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

`panes/intel-feed/IntelFeedPane.tsx` — correlated intelligence feed pane.

Reads `correlation` from `useData()` context. Two view modes toggled via toolbar: INTEL (correlated products) and RAW (chronological firehose).

### INTEL View

Shows correlated intelligence products derived from the correlation engine. Products are expandable cards with:

- **Type badge**: CORRELATION, ANOMALY, CLUSTER, TREND, or NEWS LINK with corresponding icon
- **Priority badge**: P1-P9 color-coded (red ≥8, orange ≥5, yellow below)
- **Region**: Country or region identifier
- **Title + summary**: "Conflict event with 4 fire detections within 75km", "Activity spike in MX — 221 events in 6h vs 36.3 expected"
- **Expandable details**: Click to see source DataPoints (clickable, with ISS reveal + locate) and linked news articles (external link)

Summary bar at top shows counts: X correlations, Y anomalies, Z clusters.

### RAW View

Chronological feed of GDELT events, quakes, fires, weather — sorted newest-first. Per-type filter buttons with counts. Severity badges (MON/CON/TEN/CRI). Source attribution, location context, external links, zoom-to buttons. Virtual-scrolled (68px row height, 6 row overscan).

### Watch Integration

Reads `watchActive`, `watchMode`, `watchProgress` from context. When watch source is "intel" or "all" AND `currentItemSource === "intel"`:
- Shows "WATCHING" badge in toolbar
- Highlights the product containing the current watch target with `bg-sig-accent/15` + `ring-1 ring-sig-accent/30`
- Auto-scrolls the product into view via `scrollIntoView`
- Shows progress bar (fills left-to-right over 8s dwell)

During ALL mode watch, selection highlight is suppressed when `currentItemSource` doesn't match "intel" to prevent both panes highlighting simultaneously.

### Cross-Pane Interaction

- Click any item → `setSelected(item)` + `setRevealId(item.id)` — ISS-level reveal on globe
- Locate button → `selectAndZoom(item)` — full deep zoom

---

## AlertLogPane

`panes/alert-log/AlertLogPane.tsx` — context-scored priority alerts pane.

Reads `correlation.alerts` from `useData()` context. Alerts are produced by the correlation engine's alert scorer — composite 1-10 scores with human-readable factor breakdowns. Deduped by country + type + hour.

### Features

- **Filter tabs** at top — per-type buttons with icons and counts. Click to filter, click again for all.
- **Sort toggle** — ⚡ SCORE (highest score first, default) or ⏱ NEW (newest first)
- **Score badges** — numeric 1-10 score with color coding (red ≥8, orange ≥5, yellow below)
- **Score border** — colored left border matches score severity
- **Factor breakdown** — each alert shows its scoring factors (e.g., "Severity 5/5 · Region elevated (5.0× baseline) · Correlated with other source")
- **Dedup labels** — "CRISIS EVENT (+4 similar)" when multiple events in the same country/type/hour are collapsed
- **Dismiss alerts** — X button per alert, persisted to IndexedDB (`sigint.alerts.dismissed.v1`). Dismissed alerts filtered from list and watch cycle. Restore button in toolbar shows count and clears all dismissed.
- **Virtual scrolling** — ROW_HEIGHT 64px, OVERSCAN 6 rows. Scroll resets on filter/sort change.
- **Cross-pane interaction** — click uses ISS reveal (`setSelected` + `setRevealId`), locate button does full deep zoom (`selectAndZoom`)

### Watch Integration

No local WATCH button — watch is controlled from the globe overlay. The Alert Log reads shared watch state:

- Shows "WATCHING X/Y" badge when `currentItemSource === "alerts"`
- Highlights current watch target with `bg-sig-accent/15`
- Auto-scrolls to current watch target via `scrollToIndex`
- Shows progress bar (fills left-to-right)
- During ALL mode, suppresses `isSelected` highlight when `currentItemSource` doesn't match "alerts"

---

## VideoFeedPane

`panes/video-feed/VideoFeedPane.tsx` — live HLS video streams.

Uses **HLS.js** (Apache 2.0 license) to play `.m3u8` streams from the **iptv-org** community channel directory (`iptv-org.github.io/api/streams.json` + `channels.json`). No iframes — direct `<video>` element playback.

### Features

- **Grid layouts**: 1×1, 2×1, 2×2, 3×3 toggle via toolbar
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

Shows a raw JSON view of the currently selected entity (or system status when nothing is selected). JSON output uses inline syntax highlighting via a regex tokenizer — zero external dependencies. Color mapping uses SIGINT theme CSS variables for automatic dark/light theme support:

| Token | Color | Source |
|---|---|---|
| Keys | `text-sig-accent` | Tailwind class |
| Strings | `text-sig-bright` | Tailwind class |
| Numbers | `var(--sigint-fires)` | Inline style (not registered in Tailwind) |
| Booleans | `var(--sigint-warn)` | Inline style (not registered in Tailwind) |
| Null | `text-sig-dim italic` | Tailwind class |
| Brackets/punctuation | `text-sig-dim` | Tailwind class |

Long values use horizontal scroll (`whitespace-pre overflow-x-auto`) to preserve JSON indentation — no word wrapping. COPY button copies raw JSON to clipboard.

---

## NewsFeedPane

`panes/news-feed/NewsFeedPane.tsx` — RSS news feed pane.

Displays aggregated world news from 6 RSS sources fetched server-side. This is a **non-geographic** data source — it does NOT use DataPoint, allData, DataContext, the feature registry, or the globe. It is entirely self-contained within the pane folder.

### Architecture

- **Server**: `newsCache.ts` polls 6 RSS feeds every 10 minutes, parses XML, deduplicates, caches up to 200 articles in memory. Served via `/api/news/latest` with token auth and gzip.
- **Client provider**: `newsProvider.ts` mirrors the BaseProvider contract (hydrate/refresh/getData/getSnapshot) for `NewsArticle[]` instead of `DataPoint[]`. IndexedDB persistence under `sigint.news.articles.v1`. 30-minute staleness threshold.
- **Client hook**: `useNewsData.ts` follows the `useProviderData` pattern exactly — `isMounted` local variable inside `useEffect`, `getData()` for initial call (StrictMode safe), `refresh()` for interval polls, hydration skip when cache is fresh. Called once in `DataContext`, exposed as `newsArticles` on context value. `NewsFeedPane` reads from `useData()` — does NOT call the hook directly.

### Features

- **List view**: Virtual-scrolled article list (72px row height, 6 row overscan). Each row shows source name, headline, description snippet, and relative age.
- **Source filter buttons**: ALL + per-source buttons with counts. Buttons wrap to multiple rows in narrow panels. Source labels shortened for compact display (Reuters, NYT, BBC, etc.).
- **Inline detail view**: Click article → shows headline, description, source, age. External link button opens full article in new tab. BACK button returns to list.
- **State persistence**: Selected article ID and source filter persisted to IndexedDB under `sigint.news.state.v1`. Survives drag-to-swap, minimize/restore, and pane type switching. One-time restore on mount (does not re-trigger on BACK).

### Sources

| Source | Feed URL | Type |
|--------|----------|------|
| Reuters via Google | `news.google.com/rss/search?q=when:24h+allinurl:reuters.com&ceid=US:en&hl=en-US&gl=US` | RSS |
| NYT World | `rss.nytimes.com/services/xml/rss/nyt/World.xml` | RSS |
| BBC World | `feeds.bbci.co.uk/news/world/rss.xml` | RSS |
| Al Jazeera | `www.aljazeera.com/xml/rss/all.xml` | RSS |
| The Guardian | `www.theguardian.com/world/rss` | RSS |
| NPR World | `feeds.npr.org/1004/rss.xml` | RSS |

### Settings

"NEWS FEEDS" tab in SettingsModal shows default source list (informational) and a cache clear button.

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