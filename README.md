# SIGINT

A real-time OSINT dashboard featuring live aircraft tracking, live AIS vessel tracking, live seismic monitoring, live fire hotspot monitoring, live severe weather alerts, live GDELT event intelligence, interactive globe/flat map visualization, and multi-layer geospatial intelligence. Built with Bun, React 19, and a custom Canvas 2D rendering engine with Web Worker offloading.

## Table of Contents

- [SIGINT](#sigint)
  - [Table of Contents](#table-of-contents)
  - [Screenshot](#screenshot)
  - [Overview](#overview)
  - [Features](#features)
  - [Performance](#performance)
  - [Tech Stack](#tech-stack)
  - [Architecture](#architecture)
  - [Data Sources](#data-sources)
  - [Environment Variables](#environment-variables)
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

**SIGINT** is an open-source geospatial intelligence dashboard that renders live aircraft positions from the OpenSky Network, live AIS vessel positions from aisstream.io, live seismic data from the USGS, live fire hotspot data from NASA FIRMS, live severe weather alerts from NOAA, and live geolocated news events from GDELT 2.0 onto an interactive 3D globe or flat map projection. The UI is fully responsive, scaling from mobile to desktop with adaptive controls and touch support.

Aircraft data is live — pulled directly from the OpenSky Network API every 4 minutes with smooth interpolation between refreshes. Ship data is live — the server maintains a persistent WebSocket connection to aisstream.io, streaming global AIS vessel positions in real-time, with clients polling every 5 minutes. Earthquake data is live — pulled from the USGS GeoJSON feed every 7 minutes, covering the last 7 days of global seismic activity with age-based rendering that visually distinguishes recent events from older ones. Fire data is live — the server fetches NASA FIRMS VIIRS CSV every 30 minutes, clients poll every 10 minutes. Weather data is live — severe weather alerts fetched client-side from NOAA every 5 minutes. Event data is live — the server fetches GDELT 2.0 raw export files every 15 minutes, parses geocoded conflict/crisis events, and serves them to clients with token authentication.

## Features

- **Live aircraft tracking** — Real-time positions from OpenSky Network with smooth frame-by-frame interpolation between 4-minute data refreshes
- **Live AIS vessel tracking** — Real-time global ship positions from aisstream.io via server-side WebSocket. Vessels render as heading-rotated diamonds with full AIS metadata: MMSI, IMO, call sign, vessel type, nav status, destination, draught, dimensions. Speed displayed in knots with mph conversion. Smooth interpolation between 5-minute client refreshes. Trails and lock-on tracking work identically to aircraft.
- **Live seismic monitoring** — Real-time earthquake data from USGS covering the past 7 days. Magnitude-scaled dot sizes, age-based color/opacity fading, and magnitude-scaled pulse effects make it easy to distinguish a fresh M6 from a week-old M2 at a glance.
- **Live fire hotspot monitoring** — Real-time global fire detections from NASA FIRMS (VIIRS NOAA-20). FRP-scaled dot sizes, age-based orange color fading, and FRP-scaled pulse effects. Server fetches every 30 minutes, clients poll every 10 minutes.
- **Live severe weather alerts** — Real-time NOAA severe weather alerts (US coverage). Severity-scaled sizing with crosshair shape, pulse effects on Severe/Extreme. Client-side fetch every 5 minutes, no API key required.
- **Live GDELT event intelligence** — Real-time geolocated news events from GDELT 2.0 raw export files. Server fetches and parses every 15 minutes, filtered to conflict/crisis CAMEO codes (protest, military, assault, coercion, unconventional violence). Severity derived from Goldstein scale, age-based rendering matches earthquake style. Detail panel shows headline, category, severity, tone, source, origin country, location, and direct article link.
- **Globe and flat map** — Toggle between an orthographic 3D globe and an equirectangular flat map projection, both rendered on Canvas 2D
- **Multi-pane layout** — Resizable split panes with globe and data table side by side. Minimize/restore with position memory, drag-to-swap, horizontal/vertical toggle, named layout presets (save/load/update/delete). Layout persists to IndexedDB. Mobile responsive — single pane with tab switching under 768px.
- **Aircraft metadata enrichment** — Automatic lookup of aircraft type, registration, operator, and model from a local database (~180k records)
- **Multi-layer visualization** — Aircraft, ships, GDELT events, seismic activity, fire hotspots, and severe weather as independently toggleable layers
- **Advanced aircraft filtering** — Filter by airborne/ground status, squawk codes (emergency, radio failure, hijack), and origin country
- **Global search with live globe filtering** — Search across all data layers by callsign, type, country, magnitude, MMSI, or any field. Results preview live as you type; executing the search filters the globe to show only matching points. Ctrl+K/Cmd+K shortcut.
- **Camera lock-on** — Single-click any point to lock camera at current zoom level (stops auto-rotation), double-click to progressively zoom in and track it as it moves, with smooth lerp-based camera transitions and shortest-path rotation
- **Isolation modes** — FOCUS mode shows only the selected layer type; SOLO mode shows only a single tracked entity
- **Trail rendering** — Selected items show a glowing trail of their recorded positions with real-time extrapolation. Works for both aircraft and ships.
- **Trail waypoint history** — Click any waypoint dot on a trail to see an anchored tooltip with the aircraft's altitude, speed, heading, and coordinates at that point in time. Tooltip stays locked to the point as you pan and zoom. Trail dots take click priority over overlapping data points.
- **Intel links** — Detail panel provides direct links to external intelligence sources. Aircraft link to FlightAware, FlightRadar24, and ADS-B Exchange. Earthquakes link to the USGS event page. GDELT events link directly to the source article. Links open safely in new tabs.
- **Data table pane** — Virtual-scrolling sortable/filterable grid of all live data with column header tooltips. Click a row to select on the globe, crosshair button zooms to it. Selection syncs both ways — selecting from ticker or globe auto-scrolls the table to the item.
- **Detail panel** — Swipe-to-dismiss bottom sheet on mobile, scrollable panel on desktop, showing feature-specific metadata rows. LOCATE button zooms to the selected entity on demand. FOCUS/SOLO isolation controls. Automatically repositions to the opposite side of the screen from the selected item with hysteresis to prevent jitter.
- **Entity dossier** — Dedicated pane with enriched data per entity type: aircraft photos + route + telemetry, ship AIS details + intel links, event/quake/fire/weather metadata. Two-row responsive toolbar with LOCATE/FOCUS/SOLO controls.
- **Live ticker** — Scrolling bottom feed of active tracked entities with round-robin interleaving across all 6 data types (aircraft, ships, events, quakes, fires, weather), sorted by recency. 80-item pool with Fisher-Yates shuffle for variety. Visible count scales with screen width (1–6). Hover glow feedback + native title tooltip. Clickable — selecting a ticker item zooms the globe and highlights in the data table. Non-moving aircraft and moored ships filtered from feed.
- **Dynamic data source status** — Source health reporting accurately shows which data sources are live, cached, unavailable, or offline based on actual provider state — no hardcoded labels.
- **Offline resilience** — IndexedDB caching for all live data sources (aircraft, ships, earthquakes, GDELT events, fires, weather, position trails, coastline geometry) enables instant boot from cache and graceful fallback on API errors. Auto-migrates from localStorage on first run. Trail entries expire after 24 hours and points are capped per entity to keep storage lean.
- **Token-authenticated API** — All server API routes protected by HMAC-SHA256 signed tokens with 30-minute TTL and per-IP rate limiting (60 req/min). Clients auto-refresh tokens on expiry via shared `authService`.
- **Dark and light themes** — Full theme system with CSS variable propagation
- **Responsive design** — Adaptive header controls (single-row on desktop, two-row on mobile), icon-only layer toggles on small screens, touch-friendly interactions with 40px minimum touch targets

## Performance

The rendering pipeline is designed to handle 25,000+ simultaneous tracks smoothly on both desktop and mobile:

- **Web Worker rendering** — All data point projection, interpolation, filtering, sorting, and drawing runs on a dedicated Web Worker with its own OffscreenCanvas. The main thread never blocks on point rendering — it just composites a finished bitmap each frame.
- **Split messaging** — Heavy data payloads (20K+ items) are only sent to the worker when data actually changes (~every 240-300s). Each animation frame sends only camera state (~200 bytes) to the worker.
- **Offscreen canvas caching** — The static layer (land, ocean, grid) is rendered to a cached offscreen canvas and only redraws when the camera moves. When the camera is still, static layer compositing is a single `drawImage` blit.
- **Progressive data loading** — Data refreshes drip items in at 3,000 per frame instead of delivering the full dataset in one shot, preventing frame spikes.
- **Spatial indexing** — Click and hover handlers use a grid-based spatial hash for O(1) geographic lookups instead of scanning all data points.
- **O(1) selection lookup** — Selected item tracked via `idMap` (Map by ID) instead of `allData.find()`.
- **Gzip compression** — Server responses for events and ships are gzip-compressed, reducing transfer size significantly on mobile.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) (TypeScript/JavaScript)
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide React
- **Visualization**: Custom Canvas 2D rendering engine with Web Worker offloading (modular `globe/` directory + `public/workers/pointWorker.js`)
- **Build**: Bun bundler with Tailwind plugin
- **Containerization**: Docker + Docker Compose
- **Deployment**: Heroku container stack

## Architecture

The application uses a shared data context (`DataContext`) with a multi-pane layout managed by `PaneManager`. All state — data hooks, selection, filters, view controls — lives in the context, accessible to any component via `useData()`. `App.tsx` wraps everything in `DataProvider`, and `AppShell` renders the app-level chrome (Header, Ticker) around the pane area.

The rendering pipeline uses a two-layer architecture. The main thread renders a cached static layer (land, ocean, grid) on an offscreen canvas and handles camera updates, input handling, and compositing. A dedicated Web Worker (`public/workers/pointWorker.js`) owns a separate OffscreenCanvas and handles all data point projection, interpolation, filtering, sorting, and drawing on a separate CPU core. The main thread composites both layers each frame via `drawImage`.

The pane system supports multiple simultaneous views: an interactive globe (`LiveTrafficPane`) and a virtual-scrolling data table (`DataTablePane`), with resizable split, minimize/collapse with position memory, drag-to-swap, named layout presets, and layout persistence to IndexedDB.

Data features are organized by domain: `tracking/` for live position feeds (aircraft, ships), `environmental/` for natural events (earthquakes, fires, weather), and `intel/` for news/conflict data (events). Each feature follows a consistent subdirectory pattern (`ui/`, `hooks/`, `data/`, `lib/`) with a barrel `index.ts` for clean external imports. The 5 non-aircraft providers share a `BaseProvider` base class that handles all caching boilerplate (hydrate, persist, refresh, error fallback, poll-aware `getData`). Each provider only supplies fetch logic and an optional merge function.

The server handles three data ingestion pipelines. For GDELT, it fetches the latest raw export CSV every 15 minutes, extracts geocoded conflict/crisis events, and caches them in memory. For AIS vessel data, it maintains a persistent WebSocket connection to aisstream.io, accumulating global ship positions in real-time. For NASA FIRMS, it fetches VIIRS fire hotspot CSV every 30 minutes. All three are served to clients via token-authenticated API routes with gzip compression. All API routes are protected by token authentication (HMAC-SHA256, 30-minute TTL) and per-IP rate limiting (60 req/min). Clients use a shared `authService` that handles token lifecycle automatically.

Trail recording is centralized in `DataContext` — a single `useEffect` feeds both aircraft and ship position updates to the trail service, enabling smooth interpolation and trail rendering for all moving entities.

Full technical documentation is split into focused docs:

**[docs/README.md](./docs/README.md)** — Documentation index with links to all docs

Covers architecture overview, data flow, feature system, pane system, rendering pipeline, global search, caching, and constraints.

## Data Sources

| Layer | Source | Status |
|-------|--------|--------|
| Aircraft | [OpenSky Network API](https://opensky-network.org/apidoc/) | **Live** — anonymous access, 400 credits/day, polls every 240s |
| Aircraft metadata | Local NDJSON database (`ac-db.ndjson`) | **Live** — ~180k records, server-side lookup on selection |
| Ships | [aisstream.io](https://aisstream.io) WebSocket | **Live** — server-side WebSocket stream, global AIS data, client polls every 300s |
| Seismic | [USGS Earthquake Hazards](https://earthquake.usgs.gov/earthquakes/feed/v1.0/) | **Live** — free, no auth, 7-day feed, polls every 420s |
| Fires | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | **Live** — server-side CSV fetch every 30 min, VIIRS NOAA-20, client polls every 600s |
| Weather | [NOAA Weather](https://api.weather.gov/) | **Live** — client-side fetch, free, no auth (User-Agent only), US coverage, polls every 300s |
| Events | [GDELT 2.0 Event Database](https://www.gdeltproject.org/) | **Live** — server-side fetch of raw export files every 15 min, filtered to conflict/crisis CAMEO codes, token auth |

OpenSky API calls are made client-side because Heroku's IP ranges are blocked by OpenSky. USGS earthquake data and NOAA weather alerts are also fetched client-side — free, no auth, no CORS restrictions. GDELT data is fetched server-side (CORS restrictions on raw files) — the server downloads the 15-minute export CSV, parses geocoded events, and caches in memory. AIS data is fetched server-side via persistent WebSocket to aisstream.io (no browser CORS, API key must not be exposed client-side). NASA FIRMS data is fetched server-side (API key required, large CSV payloads). Clients fetch from `/api/events/latest`, `/api/ships/latest`, and `/api/fires/latest` with a server-issued auth token.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SIGINT_SERVER_SECRET` | **Yes** | Server-only secret for signing auth tokens. Generate with `openssl rand -hex 32`. Server will refuse to start without it. |
| `AISSTREAM_API_KEY` | No | Free API key from [aisstream.io](https://aisstream.io) (sign up via GitHub). Enables live global AIS vessel data. Without it, ships layer is empty but everything else works. |
| `FIRMS_MAP_KEY` | No | Free API key from [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/api/map_key/). Enables live NASA FIRMS fire hotspot data. Without it, fires layer is empty but everything else works. |
| `PORT` | No | Server port (default: 3000) |

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