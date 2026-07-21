import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { cacheGet, cacheSet } from "@/lib/cache/storageService";
import {
  isRecord,
  parseGeoMultiPolygonCoordinates,
  type GeoMultiPolygon,
} from "@shared/geo";
import { parseLandGeoJson } from "@shared/land";

const CACHE_KEY = CACHE_KEYS.land;
const LAND_URL = "/data/ne_50m_land.json";
const LAND_CACHE_SCHEMA_VERSION = 2;
const EMPTY_LAND: GeoMultiPolygon = [];

type LandCache = Readonly<{
  schemaVersion: number;
  polygons: GeoMultiPolygon;
}>;

let landData: GeoMultiPolygon | null = null;
let loadInFlight: Promise<GeoMultiPolygon> | null = null;

function parseLandCache(value: unknown): LandCache | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== LAND_CACHE_SCHEMA_VERSION) return null;
  const polygons = parseGeoMultiPolygonCoordinates(value.polygons);
  return polygons
    ? { schemaVersion: LAND_CACHE_SCHEMA_VERSION, polygons }
    : null;
}

async function readCache(): Promise<GeoMultiPolygon | null> {
  const cached = parseLandCache(await cacheGet<unknown>(CACHE_KEY));
  return cached?.polygons ?? null;
}

function writeCache(polygons: GeoMultiPolygon): void {
  cacheSet(CACHE_KEY, {
    schemaVersion: LAND_CACHE_SCHEMA_VERSION,
    polygons,
  } satisfies LandCache);
}

async function fetchLand(): Promise<GeoMultiPolygon> {
  const response = await fetch(LAND_URL);
  if (!response.ok) {
    throw new Error(`Land geometry request failed with status ${response.status}`);
  }
  const polygons = parseLandGeoJson(await response.json());
  if (polygons.length === 0) {
    throw new Error("Land geometry contained no valid polygons");
  }
  landData = polygons;
  writeCache(polygons);
  return polygons;
}

export async function initLand(): Promise<void> {
  if (landData) return;
  landData = await readCache();
}

export function getLand(): GeoMultiPolygon {
  return landData ?? EMPTY_LAND;
}

export function loadLand(): Promise<GeoMultiPolygon> {
  if (landData) return Promise.resolve(landData);
  if (loadInFlight) return loadInFlight;
  loadInFlight = readCache()
    .then((cached) => {
      if (cached) {
        landData = cached;
        return cached;
      }
      return fetchLand();
    })
    .finally(() => {
      loadInFlight = null;
    });
  return loadInFlight;
}

export function enrichLand(onReady: (land: GeoMultiPolygon) => void): void {
  void loadLand().then(onReady).catch(() => undefined);
}
