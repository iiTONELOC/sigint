import {
  GeoJsonGeometryType,
  type GeoJsonPolygon,
  type GeoPoint,
} from "../../shared/geo";

import { getStormProducts } from "./cyclonesCache";
import { fetchKmz } from "./zipReader";
import { createPerKeyCache, PURGE_INTERVAL_MS } from "../lib/perKeyCache";
import { isFiniteCoordinate } from "../lib/geoValidation";

export const CONE_CACHE_TTL_MS = 60 * 60_000;

const CONE_COORDINATES_RE =
  /<Polygon[\s\S]*?<outerBoundaryIs[\s\S]*?<LinearRing[\s\S]*?<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i;

enum ConeParseError {
  CoordinateTriple = "Malformed coordinate triple",
  CoordinateValue = "Malformed coordinate value",
}

/** Parse the first KML polygon outer ring. */
export function parseKmlConeToGeoJSON(kml: string): GeoJsonPolygon | null {
  const match = CONE_COORDINATES_RE.exec(kml);
  if (!match?.[1]) return null;
  const triples = match[1]
    .split(/\s+/)
    .map((coordinate) => coordinate.trim())
    .filter((coordinate) => coordinate.length > 0);
  const ring: GeoPoint[] = [];
  for (const triple of triples) {
    const parts = triple.split(",");
    if (parts.length < 2) throw new Error(ConeParseError.CoordinateTriple);
    const lon = Number.parseFloat(parts[0]!);
    const lat = Number.parseFloat(parts[1]!);
    if (!isFiniteCoordinate(lat, lon)) {
      throw new Error(ConeParseError.CoordinateValue);
    }
    ring.push([lon, lat]);
  }
  if (ring.length < 4) return null;
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
