# SIGINT

A real-time OSINT dashboard featuring live aircraft tracking, interactive globe/flat map visualization, and multi-layer geospatial event monitoring. Built with Bun, React 19, and a custom Canvas 2D rendering engine.

## Table of Contents

- [SIGINT](#sigint)
  - [Table of Contents](#table-of-contents)
  - [Screenshot](#screenshot)
  - [Overview](#overview)
  - [Features](#features)
  - [Tech Stack](#tech-stack)
  - [Architecture](#architecture)
  - [Data Sources](#data-sources)
  - [Docker Architecture](#docker-architecture)
  - [Development](#development)
  - [Production](#production)
  - [Heroku Deployment](#heroku-deployment)
  - [Cleanup](#cleanup)
  - [License](#license)
  - [Author](#author)
  
## Screenshot

![SIGINT](./sigint.gif)

## Overview

**SIGINT** is an open-source geospatial intelligence dashboard that renders live aircraft positions from the OpenSky Network alongside simulated ship, event, and seismic data layers onto an interactive 3D globe or flat map projection. The UI is fully responsive, scaling from mobile to desktop with adaptive controls and touch support.

Aircraft data is live — pulled directly from the OpenSky Network API every 4 minutes with smooth interpolation between refreshes. Ship, event, and seismic layers currently use generated mock data, with the architecture designed for easy integration of real providers.

## Features

- **Live aircraft tracking** — Real-time positions from OpenSky Network with smooth frame-by-frame interpolation between 4-minute data refreshes
- **Globe and flat map** — Toggle between an orthographic 3D globe and an equirectangular flat map projection, both rendered on Canvas 2D
- **Aircraft metadata enrichment** — Automatic lookup of aircraft type, registration, operator, and model from a local database (~180k records)
- **Multi-layer visualization** — Aircraft, ships, GDELT-style events, and seismic activity as independently toggleable layers
- **Advanced aircraft filtering** — Filter by airborne/ground status, squawk codes (emergency, radio failure, hijack), and origin country
- **Global search with live globe filtering** — Search across all data layers by callsign, type, country, or any field. Results preview live as you type; executing the search filters the globe to show only matching points. Ctrl+K/Cmd+K shortcut.
- **Camera lock-on** — Double-click any point to zoom in and track it as it moves, with smooth lerp-based camera transitions
- **Isolation modes** — FOCUS mode shows only the selected layer type; SOLO mode shows only a single tracked entity
- **Trail rendering** — Selected items show a glowing trail of their recorded positions with real-time extrapolation
- **Trail waypoint history** — Click any waypoint dot on a trail to see an anchored tooltip with the aircraft's altitude, speed, heading, and coordinates at that point in time. Tooltip stays locked to the point as you pan and zoom. Trail dots take click priority over overlapping data points.
- **Detail panel** — Draggable on desktop, bottom sheet on mobile, showing feature-specific metadata rows. Automatically repositions to the opposite side of the screen from the selected item so it never covers what you're tracking.
- **Live ticker** — Scrolling bottom feed of active tracked entities with feature-specific formatting
- **Offline resilience** — IndexedDB caching (aircraft data, position trails, coastline geometry) enables instant boot from cache and graceful fallback on API errors. Auto-migrates from localStorage on first run. Trail entries expire after 24 hours and points are capped per entity to keep storage lean.
- **Dark and light themes** — Full theme system with CSS variable propagation
- **Responsive design** — Adaptive header controls, mobile gear dropdown, touch-friendly interactions

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) (TypeScript/JavaScript)
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide React
- **Visualization**: Custom Canvas 2D rendering engine (modular `globe/` directory)
- **Build**: Bun bundler with Tailwind plugin
- **Containerization**: Docker + Docker Compose
- **Deployment**: Heroku container stack

## Architecture

Full technical documentation of the data flow, caching architecture, rendering pipeline, and component hierarchy is available in the architecture doc:

**[docs/architecture.md](./docs/architecture.md)**

Covers the boot lifecycle, IndexedDB caching system, metadata enrichment pipeline, the propsRef bridge between React and the Canvas animation loop, camera state machine, interpolation mechanics, isolation modes, and the feature-folder pattern.

## Data Sources

| Layer | Source | Status |
|-------|--------|--------|
| Aircraft | [OpenSky Network API](https://opensky-network.org/apidoc/) | **Live** — anonymous access, 400 credits/day |
| Aircraft metadata | Local NDJSON database (`ac-db.ndjson`) | **Live** — ~180k records, server-side lookup |
| Ships | Generated mock data | Simulated |
| Events | Generated mock data | Simulated |
| Seismic | Generated mock data | Simulated |

OpenSky API calls are made client-side because Heroku's IP ranges are blocked by OpenSky. This means anonymous access only — no API keys can be used. The 240-second poll interval keeps usage well within the daily credit limit.

## Docker Architecture

Fully containerized with separate dev and production configurations:

- **Dev**: Hot-reload with source volumes, Caddy reverse proxy (HTTPS), renders bundled TypeScript at runtime
- **Prod**: Multi-stage build, compiles to static `dist/`, serves pre-built files at runtime, ready for Heroku container stack
- **Network**: Dev compose exposes ports 80/443 (Caddy) + 3000 (API); prod exposes 3000 with configurable PORT override

## Development

Dev with hot-reload (Caddy handles HTTPS):

```bash
npm run docker:dev:up
```

Access over the network at `https://<machine-ip>`, or locally via localhost.

Stop:

```bash
npm run docker:dev:down
```

## Production

```bash
npm run docker:prod:up
```

Stop:

```bash
npm run docker:prod:down
```

## Heroku Deployment

Push to Heroku container stack:

```bash
git push heroku main
```

Or use Container Registry:

```bash
heroku container:push web -a your-app-name
heroku container:release web -a your-app-name
```

## Cleanup

Remove containers, volumes, and images:

```bash
npm run docker:clean
```

## License

This project is dual-licensed:

- **Non-commercial use** — free under the [SIGINT Non-Commercial License](./LICENSE.md). Use it for personal projects, learning, research, portfolios, whatever you want — just not to make money.
- **Commercial use** — requires a separate paid license. [Contact the author](https://github.com/iiTONELOC) for terms.

See [LICENSE.md](./LICENSE.md) for full details.

## Author

[Anthony Tropeano](https://github.com/iiTONELOC)