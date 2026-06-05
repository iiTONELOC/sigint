// ── Tropical Cyclone Watches & Warnings cache ────────────────────────
// Server-side polling cache for active NWS tropical-cyclone alerts (CORS
// bypass + UA-header requirement). Mirrors the newsCache / firmsCache
// contract: start/stop polling + a getter that returns a public copy.
//
// Source: the NWS Alerts API (api.weather.gov/alerts/active) returns a
// GeoJSON FeatureCollection with geometry, no API key required, only a
// User-Agent header. We keep just the tropical-cyclone watch/warning
// features and slim each to the fields the globe renders, so the client
// gets a small, render-ready payload.

import { createLogger } from "../lib/logger";
import { USER_AGENT } from "./cyclonesCache";

const logger = createLogger({ service: "nhc" });

const ALERTS_URL = "https://api.weather.gov/alerts/active";
const POLL_INTERVAL_MS = 5 * 60_000; // 5 min — warnings change on advisory cadence
const FETCH_TIMEOUT_MS = 15_000;

// The five tropical-cyclone watch/warning event names NWS issues. Matched
// case-insensitively against alert `properties.event`.
const TROPICAL_EVENTS = new Set([
  "hurricane warning",
  "hurricane watch",
  "tropical storm warning",
  "tropical storm watch",
  "storm surge warning",
  "storm surge watch",
]);

// ── Slimmed warning feature ──────────────────────────────────────────
// A GeoJSON Feature carrying only what the renderer + dossier need.

export type WarningSeverity = "warning" | "watch";

export type WarningFeature = {
  id: string;
  event: string;
  /** "warning" or "watch" — drives the fill colour. */
  kind: WarningSeverity;
  headline: string;
  areaDesc: string;
  effective: string;
  expires: string;
  /** GeoJSON geometry (Polygon / MultiPolygon) in [lon, lat]. */
  geometry: unknown;
};

// ── Cache state ──────────────────────────────────────────────────────

type WarningsCache = {
  features: WarningFeature[];
  fetchedAt: number;
  featureCount: number;
  error: string | null;
};

let cache: WarningsCache = {
  features: [],
  fetchedAt: 0,
  featureCount: 0,
  error: null,
};
let intervalId: ReturnType<typeof setInterval> | null = null;

// ── Transform ────────────────────────────────────────────────────────

function kindOf(eventLower: string): WarningSeverity {
  return eventLower.includes("warning") ? "warning" : "watch";
}

/** Keep only tropical watch/warning features that carry a geometry, slimmed. */
function toWarningFeatures(json: unknown): WarningFeature[] {
  if (!json || typeof json !== "object") return [];
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const out: WarningFeature[] = [];
  for (const f of features) {
    if (!f || typeof f !== "object") continue;
    const feat = f as Record<string, unknown>;
    const geometry = feat.geometry;
    if (!geometry) continue; // some alerts have no polygon — skip (can't render)
    const props = (feat.properties ?? {}) as Record<string, unknown>;
    const event = typeof props.event === "string" ? props.event : "";
    if (!TROPICAL_EVENTS.has(event.toLowerCase())) continue;

    out.push({
      id: typeof feat.id === "string" ? feat.id : event,
      event,
      kind: kindOf(event.toLowerCase()),
      headline: typeof props.headline === "string" ? props.headline : "",
      areaDesc: typeof props.areaDesc === "string" ? props.areaDesc : "",
      effective: typeof props.effective === "string" ? props.effective : "",
      expires: typeof props.expires === "string" ? props.expires : "",
      geometry,
    });
  }
  return out;
}

// ── Poll pipeline ────────────────────────────────────────────────────

async function fetchWarnings(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(ALERTS_URL, {
      headers: {
        // NWS requires a User-Agent identifying the app; Accept GeoJSON.
        "User-Agent": USER_AGENT,
        Accept: "application/geo+json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn(`🌀 NHC warnings: HTTP ${res.status}`);
      cache = { ...cache, error: `HTTP ${res.status}` };
      return;
    }
    const features = toWarningFeatures(await res.json());
    // Retain a populated cache if upstream momentarily returns nothing.
    if (features.length > 0 || cache.features.length === 0) {
      cache = {
        features,
        fetchedAt: Date.now(),
        featureCount: features.length,
        error: null,
      };
    }
    logger.info(`🌀 NHC warnings: ${features.length} tropical watch/warning areas`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.warn(`🌀 NHC warnings: ${msg}`);
    cache = { ...cache, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API (matches newsCache / firmsCache contract) ─────────────

export function startCycloneWarningsPolling(): void {
  if (intervalId) return;
  void fetchWarnings();
  intervalId = setInterval(() => void fetchWarnings(), POLL_INTERVAL_MS);
}

export function stopCycloneWarningsPolling(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function getCycloneWarningsCache(): WarningsCache {
  return {
    features: cache.features,
    fetchedAt: cache.fetchedAt,
    featureCount: cache.featureCount,
    error: cache.error,
  };
}

/** TEST-ONLY: reset module state to the initial empty shape. */
export function __resetCycloneWarningsCacheForTests(): void {
  cache = { features: [], fetchedAt: 0, featureCount: 0, error: null };
}

/** TEST-ONLY: expose the pure transform for fixture-based tests. */
export const __toWarningFeaturesForTests = toWarningFeatures;
