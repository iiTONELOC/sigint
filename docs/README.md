# SIGINT — Technical Documentation

Internal technical documentation for the SIGINT OSINT Live Feed dashboard.

---

## Documents

| Document | Covers |
|---|---|
| [Architecture Overview](./architecture.md) | System overview, directory structure, component hierarchy, state architecture |
| [Data Flow](./data-flow.md) | DataContext, shared state, boot lifecycle, allData, filters, enrichment, trail recording |
| [Feature System](./features.md) | FeatureDefinition contract, registry, feature structure, DataPoint union, data sources |
| [Pane System](./panes.md) | PaneManager, LiveTrafficPane, DataTablePane, layout persistence |
| [Rendering Pipeline](./rendering.md) | Web Worker rendering, worker architecture, split messaging, camera, input handlers, interpolation, projections, isolation modes |
| [Global Search](./search.md) | Two-phase search, scoring, globe filtering, zoom-to, stash/restore |
| [Caching Architecture](./caching.md) | IndexedDB service, cache keys, staleness, metadata dedup, migration |
| [Constraints & Gotchas](./constraints.md) | Rate limits, client-side fetching, Canvas vs React, Web Worker constraints, dev preferences |

---

## Quick Reference

**Runtime**: Bun | **Frontend**: React 19, Tailwind 4, Canvas 2D + Web Worker

**Live data**: OpenSky Network (aircraft, 240s poll) + USGS (earthquakes, 420s poll) + GDELT 2.0 (events, 15 min server-side poll) + aisstream.io (ships, WebSocket stream, 300s client poll) + NASA FIRMS (fires, 30 min server-side poll, 600s client poll)

**State**: All shared state in `DataContext` via `useData()` hook — no external state library

**Persistence**: IndexedDB for everything — data caches, trails, coastlines, pane layout

**Rendering**: All drawing offloaded to a dedicated Web Worker with OffscreenCanvas — land, grid, ocean, points, trails rendered on a separate CPU core. Main thread handles camera, input, and composites a single `ImageBitmap` per frame via `drawImage`.

**Required env**: `SIGINT_SERVER_SECRET` — generate with `openssl rand -hex 32`

**Optional env**: `AISSTREAM_API_KEY` — free from aisstream.io, enables live AIS vessel data

**Optional env**: `FIRMS_MAP_KEY` — free from [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/api/map_key/), enables live fire hotspot data