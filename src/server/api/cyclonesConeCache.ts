import { GeoJsonGeometryType } from "../../shared/geo";
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
import { fetchWithTimeout, FETCH_TIMEOUT_STANDARD_MS } from "../lib/fetchWithTimeout";
import { createPerKeyCache, PURGE_INTERVAL_MS } from "../lib/perKeyCache";
import { isFiniteCoordinate } from "../lib/geoValidation";

// ── Config ───────────────────────────────────────────────────────────

export const CONE_CACHE_TTL_MS = 60 * 60_000;

// ── Types ────────────────────────────────────────────────────────────

export type GeoJSONPolygon = {
  type: GeoJsonGeometryType.Polygon;
  coordinates: number[][][];
};

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
    if (!isFiniteCoordinate(lat, lon)) {
      throw new Error("Malformed coordinate value");
    }
    ring.push([lon, lat]);
  }
  if (ring.length < 4) return null;
  return { type: GeoJsonGeometryType.Polygon, coordinates: [ring] };
}

// ── Single-storm cone fetch ─────────────────────────────────────────

async function fetchConeForStorm(stormId: string): Promise<GeoJSONPolygon | null> {
  const products = getStormProducts(stormId);
  if (!products?.conekmzUrl) return null;
  try {
    const res = await fetchWithTimeout(products.conekmzUrl, FETCH_TIMEOUT_STANDARD_MS);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const kml = await unzipSingleEntryKmz(new Uint8Array(buf));
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
const coneCache = createPerKeyCache<GeoJSONPolygon | null>({
  ttlMs: CONE_CACHE_TTL_MS,
  purgeIntervalMs: PURGE_INTERVAL_MS,
  emptyValue: null,
  fetch: fetchConeForStorm,
});

export async function getCycloneCone(stormId: string): Promise<CycloneConeResult> {
  const { value, fetchedAt } = await coneCache.get(stormId);
  return { cone: value, fetchedAt };
}

export function __resetCycloneConeCacheForTests(): void {
  coneCache.reset();
}
