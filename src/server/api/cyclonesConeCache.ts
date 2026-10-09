import { GeoJsonGeometryType, GeoLimit, type GeoJsonPolygon } from "@shared/geo";
import { kmlOuterRings } from "../lib/kml";

import { getStormProducts } from "./cyclonesCache";
import { fetchKmz } from "./zipReader";
import { createPerKeyCache, PURGE_INTERVAL_MS } from "../lib/perKeyCache";

export const CONE_CACHE_TTL_MS = 60 * 60_000;

/** Parse the first KML polygon outer ring. */
export function parseKmlConeToGeoJSON(kml: string): GeoJsonPolygon | null {
  const ring = kmlOuterRings(kml)[0];
  if (!ring || ring.length < GeoLimit.MinRingPointCount) return null;
  return { type: GeoJsonGeometryType.Polygon, coordinates: [ring] };
}

async function fetchConeForStorm(stormId: string): Promise<GeoJsonPolygon | null> {
  const products = getStormProducts(stormId);
  if (!products?.conekmzUrl) return null;
  try {
    const kml = await fetchKmz(products.conekmzUrl);
    return kml === null ? null : parseKmlConeToGeoJSON(kml);
  } catch {
    return null;
  }
}

export type CycloneConeResult = {
  cone: GeoJsonPolygon | null;
  fetchedAt: number;
};

const coneCache = createPerKeyCache<GeoJsonPolygon | null>({
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
