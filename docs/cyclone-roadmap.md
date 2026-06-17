# Cyclone Enhancement Roadmap

[← Back to Docs Index](./README.md)

Living checklist for the cyclone/hurricane improvements. Build in order; research
each step's exact files right before building it.

## Ground rules (non-negotiable)

- **Overlays draw in the worker** (`public/workers/pointWorker.js` + `render/*.js`),
  never the main thread. Geometry is `postMessage`'d once when it changes (small),
  then drawn per-frame in the worker.
- **New data is lazy + server-parsed**, fetched per-storm on toggle — the cone
  pattern (`/api/cyclones/:stormId/cone`). The client receives small JSON; no big
  main-thread parse.
- **Anything that touches `allData`** (assets-in-cone, landfall) must narrow via
  `spatialGrid`/bbox first, run only when a storm is **selected**, compute in
  **idle** (`lib/idle.ts` `scheduleIdle`), and cache by advisory — never per-frame,
  never over all ~100k points.
- Toggles gate cost: a feature that's off fetches/draws nothing.
- After each step, confirm no long-task on the poll tick and the globe stays smooth.

## Steps

- [x] **1. Units toggle** — `units` pref (`both`/`kt`/`mph`/`kmh`) persisted via
  `userPreferences` signal store (`useSyncExternalStore`); `lib/units.ts`
  formatters (`formatKtMph`/`formatKtShort`) read `getUnitsMode()`; UI in
  Settings → Appearance → WIND / SPEED UNITS; DetailPanel/DossierPane/Ticker
  subscribe via `useUnitsMode()` so it updates instantly. Zero blocking.
- [ ] **2. Wind radii + in-cone highlight** — worker overlay of 34/50/64-kt
  quadrant arcs; `WIND FIELD` toggle + `cycloneFilter` flag. (Confirm the NHC feed
  carries radii.)
- [ ] **3. Assets-in-threat** — selected storm only: `spatialGrid` candidates in the
  cone bbox → `pointInPolygon` → idle, cached. Chip + list in dossier/detail + globe
  ring.
- [ ] **4. Landfall ETA** — selected storm track ∩ coastline (bbox-narrowed
  `getLand`), interpolate time, idle, cache by advisory. Stat + mini-map ✕.
- [ ] **5. Mini-map enrichments** — add cone/warnings/in-cone dots/landfall ✕ to
  `CycloneForecastMiniMap`.
- [ ] **6. Spaghetti `MODELS` toggle** — server per-storm ATCF a-deck parser
  (`ftp.nhc.noaa.gov/atcf/aid_public/`, keyless) served like the cone; lazy client
  hook; worker draws thin translucent polylines under the official track.
