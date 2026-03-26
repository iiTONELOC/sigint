# SIGINT — Technical Documentation

Internal technical documentation for the SIGINT OSINT Live Feed dashboard.

---

## Documents

| Document | Covers |
|---|---|
| [Architecture Overview](./architecture.md) | System overview, directory structure, component hierarchy, state architecture |
| [Data Flow](./data-flow.md) | DataContext, shared state, boot lifecycle, allData, filters, enrichment, trail recording |
| [Feature System](./features.md) | FeatureDefinition contract, registry, feature structure, DataPoint union, data sources |
| [Walkthrough](./walkthrough.md) | Guided onboarding tour — desktop + mobile steps, action/info modes, highlight rings, obstacle avoidance |
| [Pane System](./panes.md) | PaneManager, binary split tree, all 8 pane types (globe, data table, dossier, intel feed, alert log, raw console, video feed, news feed), drag-to-swap, dossier bridge, layout persistence |
| [Rendering Pipeline](./rendering.md) | Web Worker rendering, worker architecture, split messaging, camera, input handlers, interpolation, projections, isolation modes |
| [Global Search](./search.md) | Two-phase search, scoring, globe filtering, zoom-to, stash/restore |
| [Caching Architecture](./caching.md) | IndexedDB service, cache keys, staleness, metadata dedup, migration |
| [Constraints & Gotchas](./constraints.md) | Rate limits, client-side fetching, Canvas vs React, Web Worker constraints, PWA/offline, dev preferences |

---

## Quick Reference

**Runtime**: Bun | **Frontend**: React 19, Tailwind 4, Canvas 2D + Web Worker

**Live data**: OpenSky Network (aircraft, 240s poll) + USGS (earthquakes, 420s poll) + GDELT 2.0 (events, 15 min server-side poll) + aisstream.io (ships, WebSocket stream, 300s client poll) + NASA FIRMS (fires, 30 min server-side poll, 600s client poll) + NOAA Weather (severe alerts, 300s client poll) + RSS News (6 world news feeds, 10 min server-side poll, 600s client poll)

**State**: All shared state in `DataContext` via `useData()` hook — no external state library. News data lifted to DataContext (non-geographic, not in allData — exposed as `newsArticles`). Correlation engine runs in DataContext, shared via `correlation` on context value.

**Persistence**: storageService (in-memory + persistence) for data caches, pane layout (separate mobile/desktop keys: `layoutDesktop`, `layoutMobile`, `layoutPresetsDesktop`, `layoutPresetsMobile`), video feed presets, news feed state, intel baselines, dismissed alerts

**Rendering**: All drawing offloaded to a dedicated Web Worker with OffscreenCanvas — land, grid, ocean, points, trails rendered on a separate CPU core. Main thread handles camera, input, and composites a single `ImageBitmap` per frame via `drawImage`.

**PWA/Offline**: Service worker caches app shell (cache-first assets, network-first HTML). ConnectionStatus component shows offline bar with RETRY (image probe) + pull-to-refresh on touch. Update banner with controlled activation via SW_SKIP_WAITING.

**Required env**: `SIGINT_SERVER_SECRET` — generate with `openssl rand -hex 32`

**Optional env**: `AISSTREAM_API_KEY` — free from aisstream.io, enables live AIS vessel data

**Optional env**: `FIRMS_MAP_KEY` — free from [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/api/map_key/), enables live fire hotspot data