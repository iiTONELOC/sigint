# Constraints & Gotchas

[← Back to Docs Index](./README.md)

**Related docs**: [Caching](./caching.md) · [Rendering](./rendering.md) · [Data Flow](./data-flow.md)

---

## Rate Limits

**OpenSky Network**: Anonymous access = 400 credits/day. Each `/states/all` call costs credits. The 240-second poll interval stays well under the limit for a full day of use.

**USGS**: Responses cached server-side for 60 seconds. Feed updates every 5 minutes. Our 420-second poll interval ensures every request gets fresh data. Exceeding limits returns 429.

**GDELT**: No explicit rate limit on raw export files — they're static files on a CDN, updated every 15 minutes. Our server fetches once per 15-minute interval regardless of client count. The server dedupes by tracking the last export URL fetched.

**Our API**: All server routes are rate limited at 60 requests per minute per IP via a sliding window in `api/auth.ts`. This includes the token endpoint. Protected routes (aircraft metadata, GDELT events) additionally require a valid `X-SIGINT-Token` header. Rate limit state is in-memory — resets on server restart. Stale buckets are purged every 5 minutes.

---

## Client-Side vs Server-Side Fetching

OpenSky and USGS are fetched client-side — OpenSky blocks Heroku IPs, USGS has no CORS restrictions. Cannot proxy these through the server, cannot add auth headers.

GDELT raw export files have CORS restrictions — must be fetched server-side. The server downloads, unzips (using `zlib.inflateRaw`, zero deps), parses the tab-delimited CSV, filters to conflict/crisis CAMEO codes, and caches in memory. Clients fetch the parsed result from `/api/events/latest` with a server-issued token.

---

## Canvas vs React

The globe is pure Canvas 2D. React components (Header, DetailPanel, etc.) are overlaid on top with absolute/fixed positioning. They communicate with the canvas via refs and props, not DOM events on canvas elements.

The **propsRef pattern**: The animation loop never re-registers. It reads `propsRef.current` each frame, synced from React props on every render. Max 1-frame delay between state change and canvas reflecting it.

---

## Metadata Enrichment

Best-effort only. If the server is down or the ICAO24 isn't in the database, the aircraft shows "Unknown" type. The UI never blocks on enrichment. Only fires for the currently selected aircraft to prevent cache bloat.

---

## Trail Purging

If an aircraft disappears from OpenSky data for 3 consecutive refreshes (~12 minutes), its trail is deleted. Entries older than 24 hours removed at boot. Points capped at 50 per entity.

---

## IndexedDB

Auto-migrates from localStorage on first run (one-time). No practical size limit (browser-dependent, typically hundreds of MB to GB). The aircraft cache overwrites itself every 240 seconds. The earthquake cache overwrites every 420 seconds. Layout state overwrites on every change.

---

## All Providers Cache to IndexedDB

Non-negotiable pattern. Every live data provider implements:
- `hydrate()` — read from IndexedDB on boot
- `persistCache()` — write after every successful fetch
- Fallback chain: memory → IndexedDB → empty/mock on error

New providers must follow this pattern.

---

## All Server API Calls Use authenticatedFetch

Non-negotiable pattern. Every client-side fetch to our server (`/api/*`) must go through `lib/authService.ts`'s `authenticatedFetch()`. This handles token acquisition, caching, and auto-refresh on 401. Never call `fetch()` directly for server API routes.

---

## User Preferences (Development)

- **Types ONLY, never interfaces** — intellisense populates types better
- **Tailwind classes ONLY** — no inline `style=` except dynamic per-item colors
- **Async storage** — IndexedDB for all persistence, no localStorage
- **External links** — `target="_blank" rel="noopener noreferrer"` on every external link
- **@ts-ignore comments are intentional** — preserve them