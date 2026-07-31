# SIGINT Technical Documentation

This directory contains the current technical documentation for SIGINT.

## Documents

| Document | Content |
| --- | --- |
| [Architecture](./architecture.md) | System owners, browser workers, server boundaries, and component structure |
| [Data flow](./data-flow.md) | DataWorker ownership, source reconciliation, bounded UI queries, and direct worker channels |
| [Feature system](./features.md) | Feature definitions, source registration, and source-specific behavior |
| [Pane system](./panes.md) | Desktop split tree, mobile pane layout, pane lifecycle, and dossier placement |
| [Rendering](./rendering.md) | Render surface, transferred canvas, scene protocol, RenderWorker state, and Canvas 2D frames |
| [Caching](./caching.md) | IndexedDB ownership, source caches, and trail persistence |
| [Global search](./search.md) | Bounded search results and worker-owned globe filtering |
| [Constraints](./constraints.md) | Runtime limits, worker boundaries, static routes, and deployment constraints |
| [Walkthrough](./walkthrough.md) | Step model, desktop and mobile tours, and the current mobile selector mismatch |

## Runtime summary

- Bun serves the application and server API.
- React 19 renders panes and accessible controls.
- The DataWorker owns geographic source records and IndexedDB access.
- The RenderWorker owns the transferred `OffscreenCanvas` and Canvas 2D frames.
- The CorrelationWorker owns geographic analysis copies.
- React receives source status and bounded query results.
- The service worker owns application assets and update activation.

## Render-data rule

Use this path for all geographic render data:

```text
DatasetPatch -> scene codec -> scene publisher -> scene protocol -> scene store
```

Do not send complete geographic collections through React.
