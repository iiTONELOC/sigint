// ── adsb.fi server-side aircraft cache ───────────────────────────────
// Replaces the inline OpenSky client fetch. The browser never hits
// opendata.adsb.fi directly — the server runs a tile-based polling
// sweep here, merges + dedups results, and serves them via
// /api/aircraft/states behind guardAuth (same pattern as fires/events/
// cyclones).
//
// Why server-side:
//   - adsb.fi enforces 1 req/sec/IP. Doing this from each browser
//     would burn the per-IP budget on a single user; from the server
//     we get one shared budget across the whole user base.
//   - No CORS dependency; we proxy a same-origin response that already
//     went through guardAuth.
//   - Lets us merge tile responses once and serve the dedup'd result
//     to N clients without N×37 outbound requests.
//
// SSRF (OWASP A10): ADSB_BASE_URL is a hardcoded module constant; the
// only outbound URLs are templated from AIRCRAFT_TILES (also a module
// constant) and TILE_RADIUS_NM. No client input flows into any fetch.
//
// Sweep budget: 37 tiles × 1.1 s = 40.7 s per sweep, well inside the
// 240 s poll window. The radius (250 nm) was confirmed against the
// live v3 endpoint during the verification probe (ratio 7.73 over a
// 100 nm baseline; 500 nm returned 400, server-capped).

import { enrichRecord, loadMetadataDb } from "./aircraftEnrichment";

export const ADSB_BASE_URL = "https://opendata.adsb.fi/api/v3";
export const USER_AGENT =
  "(sigint-dashboard, https://github.com/iitoneloc/sigint)";
// 300 s wake cadence. With 108 tiles × 3 s spacing the full sweep takes
// ~340 s, which exceeds the wake cadence — that's intentional: streaming
// writes mean clients see fresh data progressively *during* the sweep,
// and the sweepInProgress guard skips overlapping kicks rather than
// launching a parallel sweep that would burn the 1 req/sec/IP budget.
export const POLL_INTERVAL_MS = 300_000;
// 3 s spacing — adsb.fi's documented limit is 1 req/sec/IP, but sustained
// sweeps at 1.1 s and 2 s both produced 429s in production. 200% margin
// is the level that's held across long-running deploys without hitting
// the soft ceiling.
export const RATE_LIMIT_DELAY_MS = 3_000;
// Default backoff when 429 is returned without a Retry-After header.
// 30 s is well above the typical aisstream/adsb.fi quiet-down window so
// we don't immediately re-trip the limiter on retry. One retry per tile,
// then the tile is skipped for this sweep.
export const RETRY_DEFAULT_DELAY_MS = 30_000;
export const TILE_RADIUS_NM = 250; // v3 server cap (verified)
const FETCH_TIMEOUT_MS = 30_000;

// ── 108-tile global coverage (lat, lon) ─────────────────────────────
// Dense grid: centres ≤ 6° apart in lat and ≤ 8° apart in lon over
// high-traffic regions, sparser at high latitudes / low-receiver
// areas. Each tile is a 250 nm (≈463 km) radius disc — overlapping
// neighbours produce continuous coverage with the existing hex dedup
// merging duplicates. Earlier 37-tile sparse layout left visible
// pockets between discs in the rendered globe.
//
// Sweep budget at 1.1 s/req: 108 × 1.1 = 118.8 s, fits the 240 s poll
// window with ~48% utilisation of the 1 req/sec/IP rate cap.

// ── First-sweep priority list ────────────────────────────────────────
// On the very first sweep after process start, walk these 20 tiles
// before the remaining 88 (shuffled). Returning visitors hydrate from
// IndexedDB; the painful case is brand-new visitors hitting the site
// immediately after a Heroku dyno cycle. Ordering targets the busiest
// CONUS / EU / APAC hubs so the globe lights up where most traffic is
// before the rest of the world fills in.
//
// Every entry below MUST already exist in AIRCRAFT_TILES below — a unit
// test in tests/server/api/aircraftCache.spec.ts enforces this so the
// two lists can't drift.
export const PRIORITY_TILES: ReadonlyArray<readonly [number, number]> = [
  [37, -76], // Mid-Atlantic (DCA/PHL)
  [42, -78], // NY-PA (JFK/EWR/LGA)
  [42, -71], // New England (BOS)
  [42, -85], // OH-MI (DTW)
  [37, -122], // Bay Area (SFO)
  [32, -117], // S CA (LAX)
  [32, -97], // TX Central (DFW)
  [28, -82], // FL (MIA/MCO)
  [32, -82], // SE GA (ATL)
  [37, -83], // KY-TN (BNA)
  [50, -2], // Channel (LHR)
  [50, 5], // Benelux (AMS)
  [45, -2], // France W (CDG)
  [45, 7], // Alps (FRA/ZRH/MUC)
  [53, -2], // UK (MAN)
  [35, 138], // Tokyo (HND/NRT)
  [37, 127], // Korea (ICN)
  [28, 77], // Delhi (DEL)
  [-30, 150], // Sydney (SYD)
  [25, 55], // UAE (DXB)
] as const;

export const AIRCRAFT_TILES: ReadonlyArray<readonly [number, number]> = [
  // CONUS (31)
  [28, -82], // US South FL
  [28, -97], // US South TX-E
  [28, -100], // US South TX-W
  [32, -82], // US SE GA
  [32, -90], // US SE MS
  [32, -97], // US TX Central
  [32, -103], // US TX-NM
  [32, -110], // US AZ
  [32, -117], // US S CA
  [37, -76], // US Mid-Atlantic
  [37, -83], // US KY-TN
  [37, -90], // US MO
  [37, -97], // US KS
  [37, -104], // US CO
  [37, -111], // US UT
  [37, -118], // US NV-CA
  [37, -122], // US Bay Area
  [42, -71], // US New England
  [42, -78], // US NY-PA
  [42, -85], // US OH-MI
  [42, -92], // US IA-IL
  [42, -99], // US NE-SD
  [42, -106], // US WY
  [42, -113], // US ID
  [42, -120], // US OR-NV
  [46, -68], // US ME
  [46, -75], // US NY-VT
  [46, -90], // US WI-MN
  [46, -105], // US MT
  [46, -118], // US WA-OR
  [46, -122], // US Seattle
  // Canada (8)
  [50, -60], // CA NL
  [50, -75], // CA QC
  [50, -90], // CA ON-N
  [50, -105], // CA SK
  [50, -120], // CA BC
  [55, -75], // CA Hudson Bay
  [55, -100], // CA MB
  [55, -120], // CA NW BC
  // Alaska (2)
  [61, -150], // Alaska S
  [65, -150], // Alaska N
  // Pacific (1) — added 2026-04-28 tile audit; HNL hub previously
  // uncovered, nearest tile was Bay Area ~2200 nm away.
  [20, -157], // Hawaii
  // Mexico / Caribbean (4)
  [20, -100], // Mexico Central
  [20, -88], // Yucatan
  [18, -75], // Caribbean
  [24, -78], // Bahamas
  // South America (8)
  [-5, -55], // Brazil N
  [-10, -75], // Peru
  [-15, -47], // Brasilia
  [-20, -45], // Brazil SE
  [-23, -47], // São Paulo
  [-30, -60], // Argentina N
  [-34, -64], // Argentina C
  [-40, -65], // Patagonia
  // Europe (19) — Ukraine [50,30] dropped 2026-04-28 tile audit;
  // active conflict, no ADS-B reception, mean=0 over 2-pass probe.
  [40, -4], // Iberia
  [40, 4], // Med W
  [40, 12], // Italy
  [40, 22], // Greece
  [45, -2], // France W
  [45, 7], // Alps
  [45, 14], // Adriatic
  [45, 22], // Balkans
  [45, 30], // Black Sea
  [50, -2], // Channel
  [50, 5], // Benelux
  [50, 14], // Czech
  [50, 22], // Poland
  [55, 0], // North Sea
  [55, 12], // Denmark
  [55, 22], // Baltic
  [55, 30], // Belarus
  [60, 12], // Sweden S
  [60, 22], // Finland S
  // UK / Ireland (2)
  [53, -8], // Ireland
  [53, -2], // UK
  // Middle East / North Africa (8) — Iraq [32,45] and Iran C
  // [32,53] dropped 2026-04-28 tile audit; restricted airspace,
  // both tiles returned mean=0 over 2-pass probe.
  [32, 10], // Tunisia
  [32, 25], // Egypt N
  [32, 35], // Levant
  [28, 50], // Gulf
  [25, 45], // Saudi C
  [25, 55], // UAE
  [38, 35], // Turkey C
  [38, 27], // Turkey W
  // Africa (6)
  [8, 4], // Nigeria
  [5, 30], // Sudan S
  [-1, 36], // Kenya
  [-15, 30], // Zambia
  [-28, 25], // South Africa N
  [-33, 18], // Cape Town
  // Asia (12) — China S [28,112], Beijing [38,117], Beijing N
  // [40,116] dropped 2026-04-28 tile audit; PRC ADS-B publishing
  // restrictions, all three tiles returned mean=0 over 2-pass
  // probe. China E [32,117] retained — covers Shanghai-area
  // coastal traffic that does broadcast.
  [22, 78], // India C
  [28, 77], // Delhi
  [15, 78], // India S
  [12, 77], // Bangalore
  [10, 105], // Vietnam
  [3, 102], // Malaysia
  [15, 105], // Thailand
  [32, 117], // China E
  [37, 127], // Korea
  [35, 138], // Tokyo
  [40, 140], // Japan N
  [33, 130], // Kyushu
  // Oceania (7)
  [-30, 150], // Sydney
  [-35, 145], // Melbourne
  [-25, 135], // Australia C
  [-25, 120], // Australia W
  [-32, 116], // Perth
  [-37, 175], // Auckland
  [-44, 170], // NZ S
] as const;

// ── Types ────────────────────────────────────────────────────────────

type AdsbAircraft = {
  hex?: unknown;
  [k: string]: unknown;
};

type AircraftBody = {
  /** Pass-through of adsb.fi's `ac` array, after server-side enrichment
   *  (military classification + metadata-DB merge). The client's
   *  parseAdsbV2.ts is still the source of truth for field-level
   *  validation, but no longer does its own DB lookups. */
  ac: unknown[];
};

type AircraftCache = {
  body: AircraftBody | null;
  fetchedAt: number;
  aircraftCount: number;
  error: string | null;
};

/** Streaming cache state. `current` tracks which hex keys were seen
 *  during the *in-flight* sweep — used at end-of-sweep to prune stale
 *  aircraft from `completed`. `completed` is what reads see; it grows
 *  tile-by-tile during a cold start and refreshes per-tile when warm.
 *  Two separate maps so the prune step is correct even if reads happen
 *  during a sweep — a half-finished sweep can't accidentally erase the
 *  prior warm snapshot. */
export type SweepState = {
  current: Map<string, unknown>;
  completed: Map<string, unknown>;
};

export function createSweepState(): SweepState {
  return { current: new Map(), completed: new Map() };
}

/** Merge a tile's records into `current` and `completed`. Both maps are
 *  keyed by lowercased ICAO 24-bit hex. Records without a usable hex are
 *  dropped. After this returns, reads of `completed` see a fully merged
 *  view — Bun's single-threaded JS means there's no observable mid-merge
 *  state. */
export function ingestTile(state: SweepState, records: unknown[]): void {
  for (const rec of records) {
    if (!rec || typeof rec !== "object") continue;
    const hex = (rec as { hex?: unknown }).hex;
    if (typeof hex !== "string" || hex.length === 0) continue;
    const key = hex.toLowerCase();
    state.current.set(key, rec);
    state.completed.set(key, rec);
  }
}

/** End-of-sweep cleanup: drop entries from `completed` that weren't seen
 *  this sweep, then reset `current` for the next pass. When `current` is
 *  empty (a sweep that produced nothing — e.g. sustained 429s, network
 *  out) we *retain* the prior `completed` rather than wiping the layer.
 *  Mirrors firmsCache stale-protect behaviour. */
export function finalizeSweep(state: SweepState): void {
  if (state.current.size === 0) return;
  for (const key of state.completed.keys()) {
    if (!state.current.has(key)) state.completed.delete(key);
  }
  state.current = new Map();
}

const sweepState: SweepState = createSweepState();
let lastFetchedAt = 0;
let lastError: string | null = null;

let intervalId: ReturnType<typeof setInterval> | null = null;
// Re-entry guard. POLL_INTERVAL_MS (300 s) is shorter than the worst-case
// sweep duration (~340 s + retries), so without this flag overlapping
// setInterval kicks would launch parallel sweeps and burn the 1 req/sec
// budget twice over.
let sweepInProgress = false;

// ── Pure helpers (testable) ─────────────────────────────────────────

/** Validate the basic shape of an adsb.fi v3 tile response.
 *  Returns the normalized body or null if the shape is wrong. */
export function normalizeAdsbPayload(json: unknown): AircraftBody | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const candidate = json as { ac?: unknown };
  if (!Array.isArray(candidate.ac)) return null;
  return { ac: candidate.ac };
}

/** Merge per-tile results into a single de-duplicated list. Tile discs
 *  overlap, so the same aircraft can appear in multiple responses. We
 *  key on lowercased hex (the ICAO 24-bit address — globally unique).
 *  Records without a usable hex are dropped; later wins so the freshest
 *  positional sample for a given aircraft survives. */
export function dedupByHex<T>(records: T[]): T[] {
  const map = new Map<string, T>();
  for (const rec of records) {
    if (!rec || typeof rec !== "object") continue;
    const hex = (rec as AdsbAircraft).hex;
    if (typeof hex !== "string" || hex.length === 0) continue;
    map.set(hex.toLowerCase(), rec);
  }
  return Array.from(map.values());
}

// ── Dev-only fixture override ────────────────────────────────────────
// `AIRCRAFT_FIXTURE=<label>` short-circuits the live tile sweep and
// returns the body of `tests/fixtures/aircraft/<label>.json`. Mirrors
// the cyclones override exactly: gated on NODE_ENV !== "production",
// label matched against /^[a-z0-9-]+$/ before any file lookup
// (OWASP A01).

const FIXTURE_LABEL_RE = /^[a-z0-9-]+$/;

export type AircraftFixtureOverride = { body: unknown };

export async function resolveAircraftFixtureOverride(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AircraftFixtureOverride | null> {
  if (env.NODE_ENV === "production") return null;
  const label = env.AIRCRAFT_FIXTURE;
  if (!label) return null;
  if (!FIXTURE_LABEL_RE.test(label)) {
    throw new Error(`Invalid AIRCRAFT_FIXTURE value: ${label}`);
  }
  const path = `tests/fixtures/aircraft/${label}.json`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Fixture not found: ${path}`);
  }
  return { body: await file.json() };
}

// ── Tile fetch ───────────────────────────────────────────────────────

export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Parse an HTTP `Retry-After` header value (integer seconds form only —
 *  RFC 7231 also allows a date form, but adsb.fi always sends seconds).
 *  Returns the positive integer or null if missing/invalid. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const n = Number.parseInt(header, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Fisher-Yates shuffle, returns a fresh array. Used to randomise tile
 *  order each sweep so the same tiles aren't consistently last when the
 *  upstream throttles partway through. */
export function shuffleTiles<T>(tiles: ReadonlyArray<T>): T[] {
  const arr = [...tiles];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Injectable shuffle. Matches `SleepFn` shape — default is the real
 *  Fisher-Yates `shuffleTiles`; tests inject a pure identity shuffle so
 *  ordering assertions become deterministic. */
export type ShuffleFn = <T>(arr: ReadonlyArray<T>) => T[];

const defaultShuffle: ShuffleFn = shuffleTiles;

/** Build the first-sweep tile order: declared priority entries first
 *  (in their listed order), followed by the remaining tiles shuffled
 *  via the injected `shuffle`. Equality between tuples is structural
 *  on both coordinates — no reference comparison — so a `PRIORITY_TILES`
 *  entry that's a fresh tuple is still recognized in `AIRCRAFT_TILES`.
 *
 *  Pure: no module-state access. Deterministic given an injected
 *  shuffle. The dedup pass tolerates priority entries that don't appear
 *  in `all` (they're emitted regardless) and skips priority duplicates
 *  inside `priority` itself. */
export function buildFirstSweepOrder(
  priority: ReadonlyArray<readonly [number, number]>,
  all: ReadonlyArray<readonly [number, number]>,
  shuffle: ShuffleFn,
): Array<readonly [number, number]> {
  const isSame = (
    a: readonly [number, number],
    b: readonly [number, number],
  ): boolean => a[0] === b[0] && a[1] === b[1];

  const head: Array<readonly [number, number]> = [];
  for (const p of priority) {
    if (!head.some((q) => isSame(q, p))) head.push(p);
  }

  const tail: Array<readonly [number, number]> = [];
  for (const a of all) {
    if (!head.some((q) => isSame(q, a))) tail.push(a);
  }

  return [...head, ...shuffle(tail)];
}

/** Module-level flag flipped after the very first completed sweep
 *  (success OR empty). Subsequent sweeps use the full Fisher-Yates
 *  shuffle. Resettable in tests via `__resetFirstSweepForTests`. */
let firstSweepDone = false;

/** TEST-ONLY: clear the `firstSweepDone` flag so the next runSweep
 *  call re-uses the priority order. Name makes intent explicit. */
export function __resetFirstSweepForTests(): void {
  firstSweepDone = false;
}

/** TEST-ONLY: full module-state reset for test isolation — clears
 *  the sweep state maps, `lastFetchedAt`, `lastError`, AND
 *  `firstSweepDone`. Specs that drive `runSweep` directly should call
 *  this in afterEach so subsequent test files see a clean cache. */
export function __resetAircraftCacheForTests(): void {
  sweepState.completed.clear();
  sweepState.current.clear();
  lastFetchedAt = 0;
  lastError = null;
  firstSweepDone = false;
}

type TileAttemptResult =
  | { ok: true; ac: unknown[] }
  | { ok: false; rateLimited: true; waitMs: number };

/** One round-trip to a tile. Splits out of fetchTileWithRetry so the
 *  retry loop reads as a pure controller (cognitive-complexity gate). */
async function attemptTileFetch(
  lat: number,
  lon: number,
): Promise<TileAttemptResult> {
  const url = `${ADSB_BASE_URL}/lat/${lat}/lon/${lon}/dist/${TILE_RADIUS_NM}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
    if (res.status === 429) {
      const retryAfterSec = parseRetryAfter(res.headers.get("retry-after"));
      const waitMs =
        retryAfterSec === null ? RETRY_DEFAULT_DELAY_MS : retryAfterSec * 1000;
      return { ok: false, rateLimited: true, waitMs };
    }
    if (res.ok) {
      const json: unknown = await res.json();
      const normalized = normalizeAdsbPayload(json);
      return { ok: true, ac: normalized ? normalized.ac : [] };
    }
    console.warn(`✈️  adsb.fi tile [${lat},${lon}]: HTTP ${res.status}`);
    return { ok: true, ac: [] };
  } catch (err) {
    console.warn(
      `✈️  adsb.fi tile [${lat},${lon}]: ${err instanceof Error ? err.message : "fetch error"}`,
    );
    return { ok: true, ac: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch one tile with a single retry on HTTP 429.
 *  - First 429: read `Retry-After` (seconds), or fall back to
 *    RETRY_DEFAULT_DELAY_MS, then retry once.
 *  - Second 429: log info-level and skip this tile (return []) rather
 *    than failing the whole sweep.
 *  Other failures (network error, non-429 non-2xx, malformed JSON) also
 *  return [] — the existing dedup+merge step tolerates per-tile gaps. */
export async function fetchTileWithRetry(
  lat: number,
  lon: number,
  sleep: SleepFn = defaultSleep,
): Promise<unknown[]> {
  const first = await attemptTileFetch(lat, lon);
  if (first.ok) return first.ac;

  console.info(
    `✈️  adsb.fi rate-limited tile [${lat},${lon}], waiting ${Math.round(
      first.waitMs / 1000,
    )}s and retrying`,
  );
  await sleep(first.waitMs);

  const second = await attemptTileFetch(lat, lon);
  if (second.ok) return second.ac;

  console.info(
    `✈️  adsb.fi rate-limited tile [${lat},${lon}] twice, skipping for this sweep`,
  );
  return [];
}

/** Walk a tile list with RATE_LIMIT_DELAY_MS spacing between tiles
 *  (no trailing sleep). Returns the merged raw aircraft list — caller
 *  is responsible for dedup. Pure-ish: side effects are confined to
 *  the injected fetchFn / sleep, which is what makes the timing and
 *  ordering tests possible without real waits. */
export async function sweepTiles(
  tiles: ReadonlyArray<readonly [number, number]>,
  fetchFn: (lat: number, lon: number) => Promise<unknown[]>,
  sleep: SleepFn = defaultSleep,
): Promise<unknown[]> {
  const merged: unknown[] = [];
  for (let i = 0; i < tiles.length; i++) {
    const [lat, lon] = tiles[i] ?? [0, 0];
    const ac = await fetchFn(lat, lon);
    merged.push(...ac);
    if (i < tiles.length - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }
  return merged;
}

// ── Fetch pipeline ───────────────────────────────────────────────────

async function fetchAircraft(): Promise<void> {
  if (sweepInProgress) return;
  sweepInProgress = true;
  try {
    await runSweep();
  } finally {
    sweepInProgress = false;
  }
}

/** Inner sweep — exported for tests so ordering + per-tile behavior
 *  can be exercised without driving the real `setInterval` cadence or
 *  real HTTP. `fetchFn` / `sleep` / `shuffle` default to the real
 *  implementations; tests inject pure stand-ins.
 *
 *  The very first call after process start (or after
 *  `__resetFirstSweepForTests`) walks `PRIORITY_TILES` then the tail in
 *  shuffled order; subsequent calls go straight to a full shuffle. */
export async function runSweep(
  fetchFn: (lat: number, lon: number) => Promise<unknown[]> = (lat, lon) =>
    fetchTileWithRetry(lat, lon),
  sleep: SleepFn = defaultSleep,
  shuffle: ShuffleFn = defaultShuffle,
): Promise<void> {
  // Dev-only fixture short-circuit — see resolveAircraftFixtureOverride.
  try {
    const override = await resolveAircraftFixtureOverride();
    if (override) {
      const normalized = normalizeAdsbPayload(override.body);
      if (!normalized) {
        lastError = "Fixture has invalid shape";
        console.warn("✈️  adsb.fi: fixture override rejected (bad shape)");
        return;
      }
      // Replace the streaming cache wholesale — the fixture *is* the
      // source of truth in dev mode, no streaming needed.
      sweepState.completed = new Map();
      sweepState.current = new Map();
      ingestTile(sweepState, normalized.ac);
      lastFetchedAt = Date.now();
      lastError = null;
      console.log(
        `✈️  adsb.fi: AIRCRAFT_FIXTURE override active (${normalized.ac.length} aircraft)`,
      );
      return;
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : "Fixture override error";
    console.warn("✈️  adsb.fi: fixture override error");
    return;
  }

  // Lazy-load the metadata DB on the first sweep — keeps Heroku boot
  // under the 60 s timeout. Subsequent sweeps share the cached promise.
  const metadataDb = await loadMetadataDb();

  // First-sweep priority order targets the busiest hubs first so
  // cold-start visitors see the globe light up where most traffic
  // actually is. Every sweep after that goes back to a full shuffle so
  // sustained upstream throttling doesn't always punish the same tail
  // tiles.
  const ordered = firstSweepDone
    ? shuffle(AIRCRAFT_TILES)
    : buildFirstSweepOrder(PRIORITY_TILES, AIRCRAFT_TILES, shuffle);
  for (let i = 0; i < ordered.length; i++) {
    const [lat, lon] = ordered[i] ?? [0, 0];
    const records = await fetchFn(lat, lon);
    if (records.length > 0) {
      const enriched = records.map((r) => enrichRecord(r, metadataDb));
      ingestTile(sweepState, enriched);
      lastFetchedAt = Date.now();
    }
    if (i < ordered.length - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  // Flip the flag after the for-loop and before finalizeSweep so any
  // exception above leaves it false (next attempt re-runs priority
  // ordering instead of silently degrading to shuffle).
  firstSweepDone = true;

  // End-of-sweep prune: drop aircraft from `completed` that weren't seen
  // this pass. Empty sweep retains the warm snapshot (firmsCache pattern).
  finalizeSweep(sweepState);
  if (sweepState.completed.size === 0) {
    lastError = "Sweep returned 0 aircraft";
    console.warn("✈️  adsb.fi: sweep empty — retaining stale cache");
    return;
  }
  lastError = null;
  console.log(`✈️  adsb.fi: ${sweepState.completed.size} aircraft loaded`);
}

// ── Public API ───────────────────────────────────────────────────────

export function startAircraftPolling(): void {
  if (intervalId) return;
  console.log("✈️  adsb.fi: starting aircraft poll...");
  void fetchAircraft();
  intervalId = setInterval(() => void fetchAircraft(), POLL_INTERVAL_MS);
}

export function stopAircraftPolling(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function getAircraftCache(): AircraftCache {
  const body =
    sweepState.completed.size === 0
      ? null
      : { ac: Array.from(sweepState.completed.values()) };
  return {
    body,
    fetchedAt: lastFetchedAt,
    aircraftCount: sweepState.completed.size,
    error: lastError,
  };
}
