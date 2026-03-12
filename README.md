# SIGINT

A real-time global intelligence dashboard prototype featuring live data visualization, interactive globe/map views, and multi-layer event tracking. Currently demonstrates simulated data for ships, aircraft, seismic events, and GDELT-style intelligence events.

## Table of Contents

- [SIGINT](#sigint)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Tech Stack](#tech-stack)
  - [Docker Architecture](#docker-architecture)
  - [Screenshot](#screenshot)
  - [Development](#development)
  - [Production](#production)
  - [Heroku Deployment](#heroku-deployment)
  - [Cleanup](#cleanup)
  - [License](#license)
  - [Author](#author)

## Overview

**SIGINT** is an open-source OSINT dashboard prototype built with Bun, React, and Canvas-based 3D visualization. The app provides real-time tracking and monitoring across geospatial data streams with a responsive UI that scales from mobile to desktop.

**⚠️ Status**: Prototype using simulated mock data. Not yet connected to real data sources.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) (TypeScript/JavaScript)
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Visualization**: Canvas 3D globe + interactive map
- **Build**: Bun bundler with Tailwind plugin
- **Containerization**: Docker + Docker Compose
- **Deployment**: Heroku container stack

## Docker Architecture

Fully containerized app with separate dev and production configurations:

- **Dev**: Hot-reload with source volumes, Caddy reverse proxy (HTTPS), renders bundled TypeScript at runtime
- **Prod**: Multi-stage build, compiles to static `dist/`, serves pre-built files at runtime, ready for Heroku container stack
- **Network**: Dev compose exposes ports 80/443 (Caddy) + 3000 (API); prod exposes 3000 with configurable PORT override

Start dev or prod containers with npm scripts (see Development/Production sections below).

## Screenshot

![SIGINT](./sigint.gif)

## Development

Dev with hot-reload (Caddy handles HTTPS):

```bash
npm run docker:dev:up
```

Access via over the network at `https://<machine-ip>`, or locally via localhost.

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

This project is licensed under the **MIT License** — see [LICENSE](./LICENSE) file for details.

## Author

[iiTONELOC](https://github.com/iiTONELOC)
