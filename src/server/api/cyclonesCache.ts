import { anyActiveBasinInSeason } from "../../shared/cyclonesSeason";
import { enrichStorms } from "./cyclonesForecastTrack";
import { resetCycloneAtcfCache } from "./cyclonesAtcfCache";
import { resetCycloneConeCache } from "./cyclonesConeCache";
import { resetCycloneDossierCache } from "./cyclonesDossierCache";
import { resetCycloneHazardsCache } from "./cyclonesHazards";
import { FETCH_TIMEOUT_LARGE_MS } from "../lib/fetchWithTimeout";
import { fetchIfModified, type ValidatorStore } from "../lib/fetchIfModified";
import { createLogger } from "../lib/logger";
import { createPoller } from "../lib/poller";
import { errorMessage } from "../lib/errorMessage";
import {
  FixtureOverrideOwner,
  type FixtureOptions,
} from "../lib/fixtureOverride";
import { HttpHeader, HttpMediaType, HttpStatus, HttpUserAgent } from "@shared/http";
import { Domain } from "@shared/domain/identity";
import { isRecord } from "@shared/geo";
import { optionalString } from "@shared/text";
import { ConfigField } from "../config";

const logger = createLogger({ service: "nhc" });

export const NHC_URL = "https://www.nhc.noaa.gov/CurrentStorms.json";
export const POLL_INTERVAL_MS = 5 * 60_000;

type CyclonesBody = {
  activeStorms: unknown[];
};

type CyclonesCache = {
  body: CyclonesBody | null;
  fetchedAt: number;
  stormCount: number;
  error: string | null;
};

let cache: CyclonesCache = {
  body: null,
  fetchedAt: 0,
  stormCount: 0,
  error: null,
};

const validators: ValidatorStore = new Map();

let lastStormsSignature: string | null = null;

enum NhcProductField {
  KmzFile = "kmzFile",
  Url = "url",
  ValidTime = "validTime",
}

export type StormProducts = {
  advisoryUrl?: string;
  discussionUrl?: string;
  windProbsUrl?: string;
  conekmzUrl?: string;
  trackKmzUrl?: string;
  modelsUrl?: string;
  analysisInit?: string;
};

const stormProducts = new Map<string, StormProducts>();

/** Return a normalized NHC response or null. */
export function normalizeCyclonesPayload(
  payload: unknown,
): CyclonesBody | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const candidate = payload as { activeStorms?: unknown };
  if (!Array.isArray(candidate.activeStorms)) return null;
  return { activeStorms: candidate.activeStorms };
}

/** Fetch in season or while a prior snapshot needs continuity. */
export function shouldFetchCyclones(
  currentStormCount: number,
  now: Date = new Date(),
): boolean {
  if (currentStormCount > 0) return true;
  return anyActiveBasinInSeason(now);
}

const NHC_HEADERS: Record<string, string> = {
  [HttpHeader.UserAgent]: HttpUserAgent.SigintRepository,
  [HttpHeader.Accept]: HttpMediaType.Json,
};

function stormId(storm: unknown): string {
  return isRecord(storm) ? optionalString(storm.id) ?? "" : "";
}

export function computeStormsSignature(activeStorms: readonly unknown[]): string {
  const storms = activeStorms.filter((storm) => stormId(storm) !== "");
  storms.sort((left, right) => stormId(left).localeCompare(stormId(right)));
  return JSON.stringify(storms);
}

const cycloneFixtureOverride = new FixtureOverrideOwner(
  Domain.Cyclones,
  ConfigField.CyclonesFixture,
);

/** Run one fixture, season-gate, or live-fetch cycle. */
export async function fetchCyclones(now: Date = new Date()): Promise<void> {
  try {
    const override = await cycloneFixtureOverride.resolve();
    if (override) {
      const normalized = normalizeCyclonesPayload(override.body);
      if (!normalized) {
        cache = { ...cache, error: "Fixture has invalid shape" };
        logger.warn("🌀 NHC: fixture override rejected (bad shape)");
        return;
      }
      refreshStormProducts(normalized.activeStorms);
      await enrichStorms(normalized.activeStorms);
      cache = {
        body: normalized,
        fetchedAt: Date.now(),
        stormCount: normalized.activeStorms.length,
        error: null,
      };
      logger.info(
        `🌀 NHC: ${ConfigField.CyclonesFixture} override active (${normalized.activeStorms.length} storm(s))`,
      );
      return;
    }
  } catch (error) {
    cache = {
      ...cache,
      error: errorMessage(error, "Fixture override error"),
    };
    logger.warn("🌀 NHC: fixture override error");
    return;
  }

  if (!shouldFetchCyclones(cache.stormCount, now)) {
    if (cache.body === null) {
      cache = {
        body: { activeStorms: [] },
        fetchedAt: Date.now(),
        stormCount: 0,
        error: null,
      };
    }
    logger.info(
      "🌀 NHC: skipping fetch: no active-basin season is open and cache is empty",
    );
    return;
  }

  try {
    const response = await fetchIfModified(NHC_URL, NHC_URL, validators, {
      timeoutMs: FETCH_TIMEOUT_LARGE_MS,
      headers: NHC_HEADERS,
    });
    await processCyclonesResponse(response);
  } catch (error) {
    cache = {
      ...cache,
      error: errorMessage(error, "Unknown fetch error"),
    };
    logger.warn("🌀 NHC: fetch error");
  }
}

async function processCyclonesResponse(response: Response): Promise<void> {
  if (response.status === HttpStatus.NotModified) {
    cache = { ...cache, fetchedAt: Date.now(), error: null };
    logger.info(`🌀 NHC: ${HttpStatus.NotModified} not modified; cache is fresh`);
    return;
  }
  if (!response.ok) {
    cache = { ...cache, error: `NHC returned ${response.status}` };
    logger.warn(`🌀 NHC: HTTP ${response.status}`);
    return;
  }
  const payload: unknown = await response.json();
  const normalized = normalizeCyclonesPayload(payload);
  if (!normalized) {
    validators.delete(NHC_URL);
    cache = { ...cache, error: "NHC response missing activeStorms array" };
    logger.warn("🌀 NHC: malformed response (no activeStorms array)");
    return;
  }
  const stormsSignature = computeStormsSignature(normalized.activeStorms);
  if (stormsSignature === lastStormsSignature && cache.body !== null) {
    cache = { ...cache, fetchedAt: Date.now(), error: null };
    logger.info("🌀 NHC: storms unchanged; cache is fresh");
    return;
  }
  lastStormsSignature = stormsSignature;
  refreshStormProducts(normalized.activeStorms);
  await enrichStorms(normalized.activeStorms);
  cache = {
    body: normalized,
    fetchedAt: Date.now(),
    stormCount: normalized.activeStorms.length,
    error: null,
  };
  if (normalized.activeStorms.length > 0) {
    logger.info(
      `🌀 NHC: ${normalized.activeStorms.length} active cyclone(s) loaded`,
    );
  } else {
    logger.info("🌀 NHC: no active cyclones (out of season or quiet day)");
  }
}

function readNestedString(
  record: Record<string, unknown>,
  path: string,
  key: string,
): string | undefined {
  const parent = record[path];
  if (!parent || typeof parent !== "object") return undefined;
  const value = (parent as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function extractStormProducts(
  storm: unknown,
): { id: string; products: StormProducts } | null {
  if (!storm || typeof storm !== "object") return null;
  const record = storm as Record<string, unknown>;
  const rawId = record.id;
  if (typeof rawId !== "string") return null;
  return {
    id: rawId.toUpperCase(),
    products: {
      advisoryUrl: readNestedString(record, "publicAdvisory", NhcProductField.Url),
      discussionUrl: readNestedString(record, "forecastDiscussion", NhcProductField.Url),
      windProbsUrl: readNestedString(record, "windSpeedProbabilities", NhcProductField.Url),
      conekmzUrl: readNestedString(record, "trackCone", NhcProductField.KmzFile),
      trackKmzUrl: readNestedString(record, "forecastTrack", NhcProductField.KmzFile),
      modelsUrl: readNestedString(record, "modelGuidance", NhcProductField.Url),
      analysisInit: readNestedString(record, "windRadii", NhcProductField.ValidTime),
    },
  };
}

function refreshStormProducts(activeStorms: readonly unknown[]): void {
  stormProducts.clear();
  for (const storm of activeStorms) {
    const extracted = extractStormProducts(storm);
    if (extracted) stormProducts.set(extracted.id, extracted.products);
  }
  resetCycloneAtcfCache();
  resetCycloneConeCache();
  resetCycloneDossierCache();
  resetCycloneHazardsCache();
}

/** Return direct product URLs for one current storm. */
export function getStormProducts(stormId: string): StormProducts | null {
  return stormProducts.get(stormId.toUpperCase()) ?? null;
}

const poller = createPoller(fetchCyclones, POLL_INTERVAL_MS);

export function startCyclonesPolling(options?: FixtureOptions): void {
  if (options) cycloneFixtureOverride.configure(options);
  logger.info("🌀 NHC: starting cyclone poll...");
  poller.start();
}

export function stopCyclonesPolling(): void {
  poller.stop();
}

export function getCyclonesCache(): CyclonesCache {
  return {
    body: cache.body,
    fetchedAt: cache.fetchedAt,
    stormCount: cache.stormCount,
    error: cache.error,
  };
}

/** Reset private state for a test. */
export function __resetCyclonesCacheForTests(): void {
  cache = { body: null, fetchedAt: 0, stormCount: 0, error: null };
  validators.clear();
  lastStormsSignature = null;
  stormProducts.clear();
}
