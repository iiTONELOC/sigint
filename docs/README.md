# SIGINT — Technical Documentation

Internal technical documentation for the SIGINT OSINT Live Feed dashboard.

---

## Documents

| Document | Covers |
|---|---|
| [Architecture Overview](./architecture.md) | System overview, directory structure, component hierarchy, state architecture |
| [Data Flow](./data-flow.md) | DataContext, shared state, boot lifecycle, allData, filters, enrichment |
| [Feature System](./features.md) | FeatureDefinition contract, registry, feature structure, DataPoint union, data sources |
| [Pane System](./panes.md) | PaneManager, LiveTrafficPane, DataTablePane, layout persistence |
| [Rendering Pipeline](./rendering.md) | Globe, camera, input handlers, interpolation, projections, quake rendering, isolation modes |
| [Global Search](./search.md) | Two-phase search, scoring, globe filtering, zoom-to, stash/restore |
| [Caching Architecture](./caching.md) | IndexedDB service, cache keys, staleness, metadata dedup, migration |
| [Constraints & Gotchas](./constraints.md) | Rate limits, client-side fetching, Canvas vs React, dev preferences |

---

## Quick Reference

**Runtime**: Bun | **Frontend**: React 19, Tailwind 4, Canvas 2D

**Live data**: OpenSky Network (aircraft, 240s poll) + USGS (earthquakes, 420s poll)

**State**: All shared state in `DataContext` via `useData()` hook — no external state library

**Persistence**: IndexedDB for everything — data caches, trails, coastlines, pane layout

**Rendering**: Canvas 2D at ~60fps via `requestAnimationFrame`, decoupled from React via `propsRef` bridge
