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
import { fetchWithTimeout, FETCH_TIMEOUT_LARGE_MS } from "../lib/fetchWithTimeout";
import { createLogger } from "../lib/logger";
import { createPoller } from "../lib/poller";
import { errorMessage } from "../lib/errorMessage";
import { resolveFixtureOverride, type FixtureOptions, type FixtureOverride } from "../lib/fixtureOverride";
import { isRecord } from "../../shared/geo";
import type {
  SourceCompleteness,
  SourceError,
  SourceFreshness,
  SourcePhase,
  SourceState,
} from "../../shared/source";

const logger = createLogger({ service: "adsbfi" });

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

type AircraftSourcePolicy = Readonly<{
  freshMs: number;
  maxStaleMs: number;
}>;

export const AIRCRAFT_SOURCE_POLICY: AircraftSourcePolicy = {
  freshMs: POLL_INTERVAL_MS * 2,
  maxStaleMs: 15 * 60_000,
};

export {
  AIRCRAFT_TILES,
  PRIORITY_TILES,
  TILE_RADIUS_NM,
} from "./aircraftTiles";
import {
  AIRCRAFT_TILES,
  PRIORITY_TILES,
  TILE_RADIUS_NM,
} from "./aircraftTiles";

// ── Types ────────────────────────────────────────────────────────────

type AircraftBody = {
  ac: unknown[];
};

type AircraftCache = {
  body: AircraftBody | null;
  fetchedAt: number;
  aircraftCount: number;
  error: string | null;
  source: SourceState;
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

const MS_PER_SECOND = 1_000;

function recordObservedAt(
  record: Readonly<Record<string, unknown>>,
  receivedAt: number,
): number {
  const explicit = record.observedAt;
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return Math.min(explicit, receivedAt);
  }
  const positionAge =
    typeof record.seen_pos === "number"
      ? record.seen_pos
      : typeof record.seen === "number"
        ? record.seen
        : 0;
  return receivedAt - Math.max(0, positionAge) * MS_PER_SECOND;
}

function cachedObservedAt(value: unknown): number {
  if (!isRecord(value)) return Number.NEGATIVE_INFINITY;
  const timestamp = value.observedAt;
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? timestamp
    : Number.NEGATIVE_INFINITY;
}

/** Merge a tile and retain the freshest duplicate position. */
export function ingestTile(
  state: SweepState,
  records: unknown[],
  receivedAt = Date.now(),
): number | null {
  let newestObservedAt: number | null = null;
  for (const value of records) {
    if (!isRecord(value)) continue;
    const hex = value.hex;
    if (typeof hex !== "string" || hex.length === 0) continue;
    const key = hex.toLowerCase();
    const observedAt = recordObservedAt(value, receivedAt);
    const record = { ...value, observedAt };
    if (record.observedAt >= cachedObservedAt(state.current.get(key))) {
      state.current.set(key, record);
    }
    if (record.observedAt >= cachedObservedAt(state.completed.get(key))) {
      state.completed.set(key, record);
    }
    newestObservedAt =
      newestObservedAt === null
        ? observedAt
        : Math.max(newestObservedAt, observedAt);
  }
  return newestObservedAt;
}

/** Infer absence only when every required tile completed. */
export function finalizeSweep(
  state: SweepState,
  completeness: SourceCompleteness,
): void {
  if (completeness === "complete") {
    for (const key of state.completed.keys()) {
      if (!state.current.has(key)) state.completed.delete(key);
    }
  }
  state.current = new Map();
}

const sweepState: SweepState = createSweepState();
let sourcePhase: SourcePhase = "cold";
let sourceCompleteness: SourceCompleteness = "unknown";
let sourceSequence = 0;
let lastReceivedAt: number | null = null;
let lastObservedAt: number | null = null;
let successfulScopes = 0;
let failedScopes = 0;
let totalScopes = AIRCRAFT_TILES.length;
let sourceError: SourceError | null = null;

// Re-entry guard. POLL_INTERVAL_MS (300 s) is shorter than the worst-case
// sweep duration (~340 s + retries), so without this flag overlapping
// setInterval kicks would launch parallel sweeps and burn the 1 req/sec
// budget twice over.
let sweepInProgress = false;

// ── Pure helpers (testable) ─────────────────────────────────────────

/** Validate the basic shape of an adsb.fi v3 tile response.
 *  Returns the normalized body or null if the shape is wrong. */
export function normalizeAdsbPayload(json: unknown): AircraftBody | null {
  if (!isRecord(json) || !Array.isArray(json.ac)) return null;
  return { ac: json.ac };
}

/** Merge per-tile results into a single de-duplicated list. Tile discs
 *  overlap, so the same aircraft can appear in multiple responses. We
 *  key on lowercased hex (the ICAO 24-bit address — globally unique).
 *  Records without a usable hex are dropped; later wins so the freshest
 *  positional sample for a given aircraft survives. */
export function dedupByHex<T>(records: T[]): T[] {
  const map = new Map<string, T>();
  for (const record of records) {
    if (!isRecord(record)) continue;
    const hex = record.hex;
    if (typeof hex !== "string" || hex.length === 0) continue;
    map.set(hex.toLowerCase(), record);
  }
  return Array.from(map.values());
}

let aircraftFixtureOptions: FixtureOptions = {
  enabled: false,
  label: undefined,
};

export function __setAircraftFixtureOptionsForTests(
  opts: FixtureOptions,
): void {
  aircraftFixtureOptions = opts;
}

export function resolveAircraftFixtureOverride(
  opts: FixtureOptions = aircraftFixtureOptions,
): Promise<FixtureOverride | null> {
  return resolveFixtureOverride("aircraft", "AIRCRAFT_FIXTURE", opts);
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
    // Indices i and j are both in-bounds, so the elements are defined; the
    // temp swap satisfies noUncheckedIndexedAccess without a non-null assert.
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
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

/** Reset aircraft module state between sweep tests. */
export function __resetAircraftCacheForTests(): void {
  sweepState.completed.clear();
  sweepState.current.clear();
  sourcePhase = "cold";
  sourceCompleteness = "unknown";
  sourceSequence = 0;
  lastReceivedAt = null;
  lastObservedAt = null;
  successfulScopes = 0;
  failedScopes = 0;
  totalScopes = AIRCRAFT_TILES.length;
  sourceError = null;
  firstSweepDone = false;
}

export type AircraftTileResult =
  | Readonly<{ kind: "complete"; records: unknown[] }>
  | Readonly<{ kind: "failed"; error: SourceError }>;

type RateLimitedTileResult = Readonly<{
  kind: "rate_limited";
  waitMs: number;
}>;

type TileAttemptResult = AircraftTileResult | RateLimitedTileResult;

export type AircraftTileFetch = (
  lat: number,
  lon: number,
) => Promise<AircraftTileResult>;

export type AircraftSweepResult = Readonly<{
  records: unknown[];
  successfulScopes: number;
  failedScopes: number;
  error: SourceError | null;
}>;

/** One round-trip to a tile. Splits out of fetchTileWithRetry so the
 *  retry loop reads as a pure controller (cognitive-complexity gate). */
function failedTile(
  code: SourceError["code"],
  message: string,
): AircraftTileResult {
  return { kind: "failed", error: { code, message } };
}

async function attemptTileFetch(
  lat: number,
  lon: number,
): Promise<TileAttemptResult> {
  const label = `adsb.fi tile [${lat},${lon}]`;
  const url = `${ADSB_BASE_URL}/lat/${lat}/lon/${lon}/dist/${TILE_RADIUS_NM}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(url, FETCH_TIMEOUT_LARGE_MS, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
  } catch (error) {
    const message = errorMessage(error, "fetch error");
    logger.warn(`✈️  ${label}: ${message}`);
    return failedTile("network_error", message);
  }

  if (response.status === 429) {
    const retryAfterSec = parseRetryAfter(
      response.headers.get("retry-after"),
    );
    return {
      kind: "rate_limited",
      waitMs:
        retryAfterSec === null
          ? RETRY_DEFAULT_DELAY_MS
          : retryAfterSec * MS_PER_SECOND,
    };
  }

  if (!response.ok) {
    const message = `HTTP ${response.status}`;
    logger.warn(`✈️  ${label}: ${message}`);
    return failedTile("http_error", message);
  }

  try {
    const normalized = normalizeAdsbPayload(await response.json());
    if (!normalized) {
      const message = "Invalid adsb.fi payload";
      logger.warn(`✈️  ${label}: ${message}`);
      return failedTile("invalid_payload", message);
    }
    return { kind: "complete", records: normalized.ac };
  } catch (error) {
    const message = errorMessage(error, "Invalid adsb.fi payload");
    logger.warn(`✈️  ${label}: ${message}`);
    return failedTile("invalid_payload", message);
  }
}

/** Retry one rate limit; preserve every failure as a typed result. */
export async function fetchTileWithRetry(
  lat: number,
  lon: number,
  sleep: SleepFn = defaultSleep,
): Promise<AircraftTileResult> {
  const first = await attemptTileFetch(lat, lon);
  if (first.kind !== "rate_limited") return first;

  logger.info(
    `✈️  adsb.fi rate-limited tile [${lat},${lon}], waiting ${Math.round(
      first.waitMs / MS_PER_SECOND,
    )}s and retrying`,
  );
  await sleep(first.waitMs);

  const second = await attemptTileFetch(lat, lon);
  if (second.kind !== "rate_limited") return second;

  const message = `Rate limited twice for tile [${lat},${lon}]`;
  logger.info(`✈️  adsb.fi: ${message}`);
  return failedTile("rate_limited", message);
}

/** Walk a tile list with RATE_LIMIT_DELAY_MS spacing between tiles
 *  (no trailing sleep). Returns the merged raw aircraft list — caller
 *  is responsible for dedup. Pure-ish: side effects are confined to
 *  the injected fetchFn / sleep, which is what makes the timing and
 *  ordering tests possible without real waits. */
export async function sweepTiles(
  tiles: ReadonlyArray<readonly [number, number]>,
  fetchFn: AircraftTileFetch,
  sleep: SleepFn = defaultSleep,
): Promise<AircraftSweepResult> {
  const records: unknown[] = [];
  let successfulScopes = 0;
  let failedScopes = 0;
  let error: SourceError | null = null;

  for (let index = 0; index < tiles.length; index++) {
    const [latitude, longitude] = tiles[index] ?? [0, 0];
    const result = await fetchFn(latitude, longitude);
    if (result.kind === "complete") {
      successfulScopes++;
      records.push(...result.records);
    } else {
      failedScopes++;
      error ??= result.error;
    }
    if (index < tiles.length - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  return { records, successfulScopes, failedScopes, error };
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
function setFixtureFailure(message: string): void {
  sourcePhase = sweepState.completed.size > 0 ? "degraded" : "unavailable";
  sourceCompleteness = "unknown";
  successfulScopes = 0;
  failedScopes = 1;
  totalScopes = 1;
  sourceError = { code: "fixture_error", message };
}

export async function runSweep(
  fetchFn: AircraftTileFetch = fetchTileWithRetry,
  sleep: SleepFn = defaultSleep,
  shuffle: ShuffleFn = defaultShuffle,
): Promise<void> {
  sourcePhase = "loading";
  sourceCompleteness = "unknown";
  successfulScopes = 0;
  failedScopes = 0;
  totalScopes = AIRCRAFT_TILES.length;
  sourceError = null;
  sweepState.current = new Map();

  try {
    const override = await resolveAircraftFixtureOverride();
    if (override) {
      const normalized = normalizeAdsbPayload(override.body);
      if (!normalized) {
        setFixtureFailure("Fixture has invalid shape");
        logger.warn("✈️  adsb.fi: fixture override rejected");
        return;
      }

      sweepState.completed = new Map();
      const receivedAt = Date.now();
      lastObservedAt = ingestTile(sweepState, normalized.ac, receivedAt);
      finalizeSweep(sweepState, "complete");
      sourcePhase = "ready";
      sourceCompleteness = "complete";
      sourceSequence++;
      lastReceivedAt = receivedAt;
      successfulScopes = 1;
      totalScopes = 1;
      logger.info(
        `✈️  adsb.fi: fixture active (${normalized.ac.length} aircraft)`,
      );
      return;
    }
  } catch (error) {
    setFixtureFailure(errorMessage(error, "Fixture override error"));
    logger.warn("✈️  adsb.fi: fixture override error");
    return;
  }

  const metadataDb = await loadMetadataDb();
  const ordered = firstSweepDone
    ? shuffle(AIRCRAFT_TILES)
    : buildFirstSweepOrder(PRIORITY_TILES, AIRCRAFT_TILES, shuffle);
  totalScopes = ordered.length;
  let sweepObservedAt: number | null = null;

  for (let index = 0; index < ordered.length; index++) {
    const [latitude, longitude] = ordered[index] ?? [0, 0];
    const result = await fetchFn(latitude, longitude);
    if (result.kind === "complete") {
      const receivedAt = Date.now();
      const enriched = result.records.map((record) =>
        enrichRecord(record, metadataDb),
      );
      const observedAt = ingestTile(sweepState, enriched, receivedAt);
      sweepObservedAt =
        observedAt === null
          ? sweepObservedAt
          : Math.max(sweepObservedAt ?? observedAt, observedAt);
      successfulScopes++;
      sourceSequence++;
      lastReceivedAt = receivedAt;
      sourceCompleteness = "partial";
    } else {
      failedScopes++;
      sourceError ??= result.error;
      sourceCompleteness =
        successfulScopes > 0 ? "partial" : "unknown";
    }
    sourcePhase = failedScopes > 0 ? "degraded" : "loading";

    if (index < ordered.length - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  firstSweepDone = true;

  if (failedScopes === 0) {
    sourceCompleteness = "complete";
    sourcePhase = "ready";
    sourceError = null;
    lastObservedAt = sweepObservedAt;
  } else if (successfulScopes > 0) {
    sourceCompleteness = "partial";
    sourcePhase = "degraded";
    if (sweepObservedAt !== null) {
      lastObservedAt = Math.max(lastObservedAt ?? sweepObservedAt, sweepObservedAt);
    }
  } else {
    sourceCompleteness = "unknown";
    sourcePhase = "unavailable";
  }

  finalizeSweep(sweepState, sourceCompleteness);
  logger.info(
    `✈️  adsb.fi: ${sweepState.completed.size} aircraft, ${successfulScopes}/${totalScopes} tiles`,
  );
}

// ── Public API ───────────────────────────────────────────────────────

const poller = createPoller(fetchAircraft, POLL_INTERVAL_MS);

export function startAircraftPolling(opts?: FixtureOptions): void {
  if (opts) aircraftFixtureOptions = opts;
  logger.info("✈️  adsb.fi: starting aircraft poll...");
  poller.start();
}

export function stopAircraftPolling(): void {
  poller.stop();
}

function getSourceFreshness(now: number): SourceFreshness {
  if (lastReceivedAt === null) return "expired";
  const age = Math.max(0, now - lastReceivedAt);
  if (age <= AIRCRAFT_SOURCE_POLICY.freshMs) return "fresh";
  return age <= AIRCRAFT_SOURCE_POLICY.maxStaleMs ? "stale" : "expired";
}

function buildAircraftSourceState(now: number): SourceState {
  const freshness = getSourceFreshness(now);
  const phase =
    freshness === "expired" &&
    (sourcePhase === "ready" || sourcePhase === "degraded")
      ? "unavailable"
      : sourcePhase;
  return {
    source: "aircraft",
    phase,
    freshness,
    completeness: sourceCompleteness,
    sequence: sourceSequence,
    observedAt: lastObservedAt,
    receivedAt: lastReceivedAt,
    expiresAt:
      lastReceivedAt === null
        ? null
        : lastReceivedAt + AIRCRAFT_SOURCE_POLICY.maxStaleMs,
    successfulScopes,
    failedScopes,
    totalScopes,
    error: sourceError,
  };
}

export function getAircraftCache(now = Date.now()): AircraftCache {
  const hasSnapshot =
    sweepState.completed.size > 0 || sourceCompleteness !== "unknown";
  return {
    body: hasSnapshot
      ? { ac: Array.from(sweepState.completed.values()) }
      : null,
    fetchedAt: lastReceivedAt ?? 0,
    aircraftCount: sweepState.completed.size,
    error: sourceError?.message ?? null,
    source: buildAircraftSourceState(now),
  };
}
