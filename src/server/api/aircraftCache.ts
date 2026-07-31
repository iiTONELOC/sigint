import { firstNumber } from "../../shared/types/numbers";
import { MS_PER_SECOND } from "../../shared/time";
import { Domain } from "@shared/domain/identity";
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
//     to N clients without N times 108 outbound requests.
//
// SSRF (OWASP A10): ADSB_BASE_URL is a hardcoded module constant; the
// only outbound URLs are templated from AIRCRAFT_TILES (also a module
// constant) and TILE_RADIUS_NM. No client input flows into any fetch.
//
// Sweep budget: 108 tiles with 3 s spacing takes at least 321 s.
// Sweeps therefore run continuously instead of using an interval.
// The radius (250 nm) was confirmed against the live v3 endpoint.

import { enrichRecord, loadMetadataDb } from "./aircraftEnrichment";
import { fetchWithTimeout, FETCH_TIMEOUT_LARGE_MS } from "../lib/fetchWithTimeout";
import { createLogger } from "../lib/logger";
import { errorMessage } from "../lib/errorMessage";
import { resolveFixtureOverride, type FixtureOptions, type FixtureOverride } from "../lib/fixtureOverride";
import { isRecord } from "../../shared/geo";
import { SourceCompleteness, SourceErrorCode, SourceFreshness, SourcePhase, type SourceError, type SourceState } from "../../shared/source";

const logger = createLogger({ service: "adsbfi" });

export const ADSB_BASE_URL = "https://opendata.adsb.fi/api/v3";
export const USER_AGENT =
  "(sigint-dashboard, https://github.com/iitoneloc/sigint)";

export enum AircraftSourcePolicy {
  FreshMs = 600_000,
  MaxStaleMs = 900_000,
  RateLimitDelayMs = 3_000,
  RetryDefaultDelayMs = 30_000,
}

enum AircraftMessage {
  SweepFailed = "Aircraft sweep failed",
}

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

function recordObservedAt(
  record: Readonly<Record<string, unknown>>,
  receivedAt: number,
): number {
  const explicit = record.observedAt;
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return Math.min(explicit, receivedAt);
  }
  const positionAge = firstNumber(record.seen_pos, record.seen);
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
  if (completeness === SourceCompleteness.Complete) {
    for (const key of state.completed.keys()) {
      if (!state.current.has(key)) state.completed.delete(key);
    }
  }
  state.current = new Map();
}

const sweepState: SweepState = createSweepState();
let sourcePhase: SourcePhase = SourcePhase.Cold;
let sourceCompleteness: SourceCompleteness = SourceCompleteness.Unknown;
let sourceSequence = 0;
let lastReceivedAt: number | null = null;
let lastObservedAt: number | null = null;
let successfulScopes = 0;
let failedScopes = 0;
let totalScopes = AIRCRAFT_TILES.length;
let sourceError: SourceError | null = null;
let acquisitionController: AbortController | null = null;

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
type NowFn = () => number;

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function remainingRequestDelay(startedAt: number, finishedAt: number): number {
  const elapsedMs = Math.max(0, finishedAt - startedAt);
  return Math.max(0, AircraftSourcePolicy.RateLimitDelayMs - elapsedMs);
}

/** Parse an HTTP `Retry-After` header value (integer seconds form only —
 *  RFC 7231 also allows a date form, but adsb.fi always sends seconds).
 *  Returns the positive integer or null if missing/invalid. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const n = Number.parseInt(header, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Build the first-sweep tile order: declared priority entries first
 *  in their listed order, followed by the remaining declared tiles.
 *  Equality between tuples is structural, so a `PRIORITY_TILES`
 *  entry that's a fresh tuple is still recognized in `AIRCRAFT_TILES`.
 *
 *  The dedup pass tolerates priority entries that don't appear in `all`
 *  and skips priority duplicates inside `priority` itself. */
export function buildFirstSweepOrder(
  priority: ReadonlyArray<readonly [number, number]>,
  all: ReadonlyArray<readonly [number, number]>,
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

  return [...head, ...tail];
}

/** Module-level flag flipped after the very first completed sweep
 *  (success OR empty). Subsequent sweeps use the declared tile order. */
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
  sourcePhase = SourcePhase.Cold;
  sourceCompleteness = SourceCompleteness.Unknown;
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
    return failedTile(SourceErrorCode.NetworkError, message);
  }

  if (response.status === 429) {
    const retryAfterSec = parseRetryAfter(
      response.headers.get("retry-after"),
    );
    return {
      kind: "rate_limited",
      waitMs:
        retryAfterSec === null
          ? AircraftSourcePolicy.RetryDefaultDelayMs
          : retryAfterSec * MS_PER_SECOND,
    };
  }

  if (!response.ok) {
    const message = `HTTP ${response.status}`;
    logger.warn(`✈️  ${label}: ${message}`);
    return failedTile(SourceErrorCode.HttpError, message);
  }

  try {
    const normalized = normalizeAdsbPayload(await response.json());
    if (!normalized) {
      const message = "Invalid adsb.fi payload";
      logger.warn(`✈️  ${label}: ${message}`);
      return failedTile(SourceErrorCode.InvalidPayload, message);
    }
    return { kind: "complete", records: normalized.ac };
  } catch (error) {
    const message = errorMessage(error, "Invalid adsb.fi payload");
    logger.warn(`✈️  ${label}: ${message}`);
    return failedTile(SourceErrorCode.InvalidPayload, message);
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
  return failedTile(SourceErrorCode.RateLimited, message);
}

/** Walk a tile list with rate-limit spacing between tiles.
 *  The caller owns deduplication of the returned records. */
export async function sweepTiles(
  tiles: ReadonlyArray<readonly [number, number]>,
  fetchFn: AircraftTileFetch,
  sleep: SleepFn = defaultSleep,
  now: NowFn = Date.now,
): Promise<AircraftSweepResult> {
  const records: unknown[] = [];
  let successfulScopes = 0;
  let failedScopes = 0;
  let error: SourceError | null = null;

  for (let index = 0; index < tiles.length; index++) {
    const [latitude, longitude] = tiles[index] ?? [0, 0];
    const requestStartedAt = now();
    const result = await fetchFn(latitude, longitude);
    if (result.kind === "complete") {
      successfulScopes++;
      records.push(...result.records);
    } else {
      failedScopes++;
      error ??= result.error;
    }
    if (index < tiles.length - 1) {
      const delayMs = remainingRequestDelay(requestStartedAt, now());
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  return { records, successfulScopes, failedScopes, error };
}

// ── Fetch pipeline ───────────────────────────────────────────────────

/** Inner sweep — exported for tests so ordering + per-tile behavior
 *  can be exercised without driving the long-lived acquisition loop or
 *  real HTTP. Tests inject fetch and sleep stand-ins.
 *
 *  The very first call after process start (or after
 *  `__resetFirstSweepForTests`) walks `PRIORITY_TILES` then the tail.
 *  Subsequent calls use the declared tile order. */
function setFixtureFailure(message: string): void {
  sourcePhase = sweepState.completed.size > 0 ? SourcePhase.Degraded : SourcePhase.Unavailable;
  sourceCompleteness = SourceCompleteness.Unknown;
  successfulScopes = 0;
  failedScopes = 1;
  totalScopes = 1;
  sourceError = { code: SourceErrorCode.FixtureError, message };
}

/** Returns true when a fixture override served the sweep. */
async function runFixtureSweep(): Promise<boolean> {
  const override = await resolveAircraftFixtureOverride();
  if (!override) return false;

  const normalized = normalizeAdsbPayload(override.body);
  if (!normalized) {
    setFixtureFailure("Fixture has invalid shape");
    logger.warn("✈️  adsb.fi: fixture override rejected");
    return true;
  }

  sweepState.completed = new Map();
  const receivedAt = Date.now();
  lastObservedAt = ingestTile(sweepState, normalized.ac, receivedAt);
  finalizeSweep(sweepState, SourceCompleteness.Complete);
  sourcePhase = SourcePhase.Ready;
  sourceCompleteness = SourceCompleteness.Complete;
  sourceSequence++;
  lastReceivedAt = receivedAt;
  successfulScopes = 1;
  totalScopes = 1;
  logger.info(
    `✈️  adsb.fi: fixture active (${normalized.ac.length} aircraft)`,
  );
  return true;
}

function recordTileSuccess(
  records: readonly unknown[],
  metadataDb: Awaited<ReturnType<typeof loadMetadataDb>>,
  observedSoFar: number | null,
): number | null {
  const receivedAt = Date.now();
  const enriched = records.map((record) => enrichRecord(record, metadataDb));
  const observedAt = ingestTile(sweepState, enriched, receivedAt);
  successfulScopes++;
  sourceSequence++;
  lastReceivedAt = receivedAt;
  sourceCompleteness = SourceCompleteness.Partial;
  if (observedAt === null) return observedSoFar;
  return Math.max(observedSoFar ?? observedAt, observedAt);
}

function recordTileFailure(error: SourceError): void {
  failedScopes++;
  sourceError ??= error;
  sourceCompleteness =
    successfulScopes > 0
      ? SourceCompleteness.Partial
      : SourceCompleteness.Unknown;
}

function settleSweep(sweepObservedAt: number | null): void {
  if (failedScopes === 0) {
    sourceCompleteness = SourceCompleteness.Complete;
    sourcePhase = SourcePhase.Ready;
    sourceError = null;
    lastObservedAt = sweepObservedAt;
    return;
  }
  if (successfulScopes > 0) {
    sourceCompleteness = SourceCompleteness.Partial;
    sourcePhase = SourcePhase.Degraded;
    if (sweepObservedAt !== null) {
      lastObservedAt = Math.max(
        lastObservedAt ?? sweepObservedAt,
        sweepObservedAt,
      );
    }
    return;
  }
  sourceCompleteness = SourceCompleteness.Unknown;
  sourcePhase = SourcePhase.Unavailable;
}

function beginSweep(): void {
  sourcePhase = SourcePhase.Loading;
  sourceCompleteness = SourceCompleteness.Unknown;
  successfulScopes = 0;
  failedScopes = 0;
  totalScopes = AIRCRAFT_TILES.length;
  sourceError = null;
  sweepState.current = new Map();
}

export async function runSweep(
  fetchFn: AircraftTileFetch = fetchTileWithRetry,
  sleep: SleepFn = defaultSleep,
  now: NowFn = Date.now,
): Promise<void> {
  beginSweep();

  try {
    if (await runFixtureSweep()) return;
  } catch (error) {
    setFixtureFailure(errorMessage(error, "Fixture override error"));
    logger.warn("✈️  adsb.fi: fixture override error");
    return;
  }

  const metadataDb = await loadMetadataDb();
  const ordered = firstSweepDone
    ? AIRCRAFT_TILES
    : buildFirstSweepOrder(PRIORITY_TILES, AIRCRAFT_TILES);
  totalScopes = ordered.length;
  let sweepObservedAt: number | null = null;

  for (let index = 0; index < ordered.length; index++) {
    const [latitude, longitude] = ordered[index] ?? [0, 0];
    const requestStartedAt = now();
    const result = await fetchFn(latitude, longitude);
    if (result.kind === "complete") {
      sweepObservedAt = recordTileSuccess(
        result.records,
        metadataDb,
        sweepObservedAt,
      );
    } else {
      recordTileFailure(result.error);
    }
    sourcePhase =
      failedScopes > 0 ? SourcePhase.Degraded : SourcePhase.Loading;

    if (index < ordered.length - 1) {
      const delayMs = remainingRequestDelay(requestStartedAt, now());
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  firstSweepDone = true;
  settleSweep(sweepObservedAt);

  finalizeSweep(sweepState, sourceCompleteness);
  logger.info(
    `✈️  adsb.fi: ${sweepState.completed.size} aircraft, ${successfulScopes}/${totalScopes} tiles`,
  );
}

// ── Public API ───────────────────────────────────────────────────────

export type AircraftSweepFn = () => Promise<void>;

export async function runAircraftAcquisition(
  signal: AbortSignal,
  sweep: AircraftSweepFn = runSweep,
  sleep: SleepFn = defaultSleep,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await sweep();
    } catch (error) {
      logger.error(
        `✈️  adsb.fi: aircraft sweep failed: ${errorMessage(
          error,
          AircraftMessage.SweepFailed,
        )}`,
      );
    }
    if (!signal.aborted) {
      await sleep(AircraftSourcePolicy.RateLimitDelayMs);
    }
  }
}

export function startAircraftPolling(opts?: FixtureOptions): void {
  if (acquisitionController !== null) return;
  if (opts) aircraftFixtureOptions = opts;
  logger.info("✈️  adsb.fi: starting aircraft poll...");
  const controller = new AbortController();
  acquisitionController = controller;
  void runAircraftAcquisition(controller.signal).finally(() => {
    if (acquisitionController === controller) {
      acquisitionController = null;
    }
  });
}

export function stopAircraftPolling(): void {
  acquisitionController?.abort();
}

function getSourceFreshness(now: number): SourceFreshness {
  if (lastReceivedAt === null) return SourceFreshness.Expired;
  const age = Math.max(0, now - lastReceivedAt);
  if (age <= AircraftSourcePolicy.FreshMs) return SourceFreshness.Fresh;
  return age <= AircraftSourcePolicy.MaxStaleMs
    ? SourceFreshness.Stale
    : SourceFreshness.Expired;
}

function buildAircraftSourceState(now: number): SourceState {
  const freshness = getSourceFreshness(now);
  const phase =
    freshness === SourceFreshness.Expired &&
    (sourcePhase === SourcePhase.Ready || sourcePhase === SourcePhase.Degraded)
      ? SourcePhase.Unavailable
      : sourcePhase;
  return {
    source: Domain.Aircraft,
    phase,
    freshness,
    completeness: sourceCompleteness,
    sequence: sourceSequence,
    observedAt: lastObservedAt,
    receivedAt: lastReceivedAt,
    expiresAt:
      lastReceivedAt === null
        ? null
        : lastReceivedAt + AircraftSourcePolicy.MaxStaleMs,
    successfulScopes,
    failedScopes,
    totalScopes,
    error: sourceError,
  };
}

export function getAircraftCache(now = Date.now()): AircraftCache {
  const hasSnapshot =
    sweepState.completed.size > 0 || sourceCompleteness !== SourceCompleteness.Unknown;
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
