// ── Cyclones cone cache ──────────────────────────────────────────────
// Per-storm cache of NHC's official 5-day cone polygon, served as
// GeoJSON. Mirrors cyclonesDossierCache.ts shape — Map<stormId,
// CacheEntry<Polygon>>, 60-min TTL, stale-while-revalidate, 10-min
// purge interval.
//
// Pipeline: cyclonesCache.ts stashes the per-storm trackCone.kmzFile
// URL after each successful CurrentStorms.json poll. This module
// fetches that URL, unzips the single KML entry via zipReader, parses
// the <Polygon><outerBoundaryIs><LinearRing><coordinates> text, and
// returns a GeoJSON Polygon to the client. The browser never sees the
// KMZ — server-side proxy avoids shipping a ZIP unzipper to the worker.
//
// SSRF (OWASP A10): the kmzFile URL comes from NHC's payload, never
// from a client request. The :stormId path param is a Map key only,
// not interpolated into any outbound URL.

import { getStormProducts } from "./cyclonesCache";
import { unzipSingleEntryKmz } from "./zipReader";

// ── Config ───────────────────────────────────────────────────────────

export const CONE_CACHE_TTL_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const PURGE_INTERVAL_MS = 10 * 60_000;

// ── Types ────────────────────────────────────────────────────────────

export type GeoJSONPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

type CacheEntry = {
  cone: GeoJSONPolygon | null;
  expiresAt: number;
  fetchedAt: number;
};

// ── Cache state ──────────────────────────────────────────────────────

const cache = new Map<string, CacheEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) cache.delete(key);
  }
}, PURGE_INTERVAL_MS);

// ── Fetch with timeout ───────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── KML → GeoJSON ────────────────────────────────────────────────────

const COORDS_RE =
  /<Polygon[\s\S]*?<outerBoundaryIs[\s\S]*?<LinearRing[\s\S]*?<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i;

/** Parse a KML document's first Polygon outer ring into a GeoJSON
 *  Polygon. KML coordinate triples are `lon,lat,alt` whitespace-
 *  separated — same lon-then-lat order as GeoJSON, no swap needed.
 *  Returns null when the document has no Polygon, or coordinates
 *  parse to fewer than 4 vertices (invalid GeoJSON Polygon ring). */
export function parseKmlConeToGeoJSON(kml: string): GeoJSONPolygon | null {
  const match = COORDS_RE.exec(kml);
  if (!match?.[1]) return null;
  const triples = match[1]
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const ring: number[][] = [];
  for (const t of triples) {
    const parts = t.split(",");
    if (parts.length < 2) throw new Error("Malformed coordinate triple");
    const lon = Number.parseFloat(parts[0]!);
    const lat = Number.parseFloat(parts[1]!);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new Error("Malformed coordinate value");
    }
    ring.push([lon, lat]);
  }
  if (ring.length < 4) return null;
  return { type: "Polygon", coordinates: [ring] };
}

// ── Single-storm cone fetch ─────────────────────────────────────────

async function fetchConeForStorm(stormId: string): Promise<GeoJSONPolygon | null> {
  const products = getStormProducts(stormId);
  if (!products?.conekmzUrl) return null;
  try {
    const res = await fetchWithTimeout(products.conekmzUrl);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const kml = unzipSingleEntryKmz(new Uint8Array(buf));
    return parseKmlConeToGeoJSON(kml);
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────

export type CycloneConeResult = {
  cone: GeoJSONPolygon | null;
  fetchedAt: number;
};

/** Get the cone GeoJSON for a storm. Same TTL + stale-while-revalidate
 *  pattern as cyclonesDossierCache. Cone fetch failure is silent — the
 *  client falls back to the synthesized cone. */
export async function getCycloneCone(stormId: string): Promise<CycloneConeResult> {
  const now = Date.now();
  const existing = cache.get(stormId);

  if (existing && existing.expiresAt > now) {
    return { cone: existing.cone, fetchedAt: existing.fetchedAt };
  }

  try {
    const cone = await fetchConeForStorm(stormId);
    const entry: CacheEntry = {
      cone,
      expiresAt: now + CONE_CACHE_TTL_MS,
      fetchedAt: now,
    };
    cache.set(stormId, entry);
    return { cone, fetchedAt: now };
  } catch {
    if (existing) return { cone: existing.cone, fetchedAt: existing.fetchedAt };
    return { cone: null, fetchedAt: now };
  }
}

export function __resetCycloneConeCacheForTests(): void {
  cache.clear();
}
