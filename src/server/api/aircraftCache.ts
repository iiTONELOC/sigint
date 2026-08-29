import { firstNumber } from "../../shared/types/numbers";
import { MS_PER_SECOND } from "../../shared/time";
import { Domain } from "@shared/domain/identity";
import { enrichRecord, loadMetadataDb } from "./aircraftEnrichment";
import {
  fetchWithTimeout,
  FETCH_TIMEOUT_LARGE_MS,
} from "../lib/fetchWithTimeout";
import { createLogger } from "../lib/logger";
import { errorMessage } from "../lib/errorMessage";
import { ConfigField } from "../config";
import {
  FixtureOverrideOwner,
  type FixtureOptions,
} from "../lib/fixtureOverride";
import { isRecord } from "../../shared/geo";
import { HttpHeader, HttpMediaType, HttpStatus } from "../../shared/http";
import {
  SourceCompleteness,
  SourceErrorCode,
  SourceFreshness,
  SourcePhase,
  type SourceError,
  type SourceState,
} from "../../shared/source";

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

export { AIRCRAFT_TILES, TILE_RADIUS_NM } from "./aircraftTiles";
import {
  AIRCRAFT_TILES,
  TILE_RADIUS_NM,
  type AircraftTile,
} from "./aircraftTiles";

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

/** Validate the basic shape of an adsb.fi v3 tile response.
 *  Returns the normalized body or null if the shape is wrong. */
export function normalizeAdsbPayload(json: unknown): AircraftBody | null {
  if (!isRecord(json) || !Array.isArray(json.ac)) return null;
  return { ac: json.ac };
}

const aircraftFixtureOverride = new FixtureOverrideOwner(
  Domain.Aircraft,
  ConfigField.AircraftFixture,
);

export type SleepFn = (ms: number) => Promise<void>;
type NowFn = () => number;

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function remainingRequestDelay(startedAt: number, finishedAt: number): number {
  const elapsedMs = Math.max(0, finishedAt - startedAt);
  return Math.max(0, AircraftSourcePolicy.RateLimitDelayMs - elapsedMs);
}

/** Parse an HTTP `Retry-After` header value (integer seconds form only;
 *  RFC 7231 also allows a date form, but adsb.fi always sends seconds).
 *  Returns the positive integer or null if missing/invalid. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const n = Number.parseInt(header, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function buildFirstSweepOrder(
  tiles: readonly AircraftTile[],
): AircraftTile[] {
  return [...tiles].sort(
    ([, , leftRank], [, , rightRank]) =>
      (leftRank ?? Number.MAX_SAFE_INTEGER) -
      (rightRank ?? Number.MAX_SAFE_INTEGER),
  );
}

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

export enum AircraftTileResultKind {
  Complete = "complete",
  Failed = "failed",
  RateLimited = "rate_limited",
}

export type AircraftTileResult =
  | Readonly<{
      kind: AircraftTileResultKind.Complete;
      records: unknown[];
    }>
  | Readonly<{
      kind: AircraftTileResultKind.Failed;
      error: SourceError;
    }>;

type RateLimitedTileResult = Readonly<{
  kind: AircraftTileResultKind.RateLimited;
  waitMs: number;
}>;

type TileAttemptResult = AircraftTileResult | RateLimitedTileResult;

export type AircraftTileFetch = (
  lat: number,
  lon: number,
) => Promise<AircraftTileResult>;

function failedTile(
  code: SourceErrorCode,
  message: string,
): AircraftTileResult {
  return { kind: AircraftTileResultKind.Failed, error: { code, message } };
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
        [HttpHeader.UserAgent]: USER_AGENT,
        [HttpHeader.Accept]: HttpMediaType.Json,
      },
    });
  } catch (error) {
    const message = errorMessage(error, "fetch error");
    logger.warn(`✈️  ${label}: ${message}`);
    return failedTile(SourceErrorCode.NetworkError, message);
  }

  if (response.status === HttpStatus.TooManyRequests) {
    const retryAfterSec = parseRetryAfter(
      response.headers.get(HttpHeader.RetryAfter),
    );
    return {
      kind: AircraftTileResultKind.RateLimited,
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
    return {
      kind: AircraftTileResultKind.Complete,
      records: normalized.ac,
    };
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
  if (first.kind !== AircraftTileResultKind.RateLimited) return first;

  logger.info(
    `✈️  adsb.fi rate-limited tile [${lat},${lon}], waiting ${Math.round(
      first.waitMs / MS_PER_SECOND,
    )}s and retrying`,
  );
  await sleep(first.waitMs);

  const second = await attemptTileFetch(lat, lon);
  if (second.kind !== AircraftTileResultKind.RateLimited) return second;

  const message = `Rate limited twice for tile [${lat},${lon}]`;
  logger.info(`✈️  adsb.fi: ${message}`);
  return failedTile(SourceErrorCode.RateLimited, message);
}

/** Inner sweep; exported for tests so ordering and per-tile behavior
 *  can be exercised without driving the long-lived acquisition loop or
 *  real HTTP. Tests inject fetch and sleep stand-ins.
 *
 *  The very first call after process start (or after
 *  `__resetFirstSweepForTests`) walks ranked tiles first.
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
  const override = await aircraftFixtureOverride.resolve();
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
  observedSoFar: number | null,
): number | null {
  const receivedAt = Date.now();
  const enriched = records.map(enrichRecord);
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

  await loadMetadataDb();
  const ordered = firstSweepDone
    ? AIRCRAFT_TILES
    : buildFirstSweepOrder(AIRCRAFT_TILES);
  totalScopes = ordered.length;
  let sweepObservedAt: number | null = null;

  for (let index = 0; index < ordered.length; index++) {
    const [latitude, longitude] = ordered[index] ?? [0, 0];
    const requestStartedAt = now();
    const result = await fetchFn(latitude, longitude);
    if (result.kind === AircraftTileResultKind.Complete) {
      sweepObservedAt = recordTileSuccess(
        result.records,
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

export function startAircraftPolling(options?: FixtureOptions): void {
  if (acquisitionController !== null) return;
  if (options) aircraftFixtureOverride.configure(options);
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
