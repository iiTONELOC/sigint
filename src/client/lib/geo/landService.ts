import { cacheGet, cacheSet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";
import {
  isRecord,
  parseGeoMultiPolygonCoordinates,
  type GeoMultiPolygon,
} from "@shared/geo";
import { parseLandGeoJson } from "@shared/land";

const EMPTY_LAND: GeoMultiPolygon = [];

enum LandAssetPath {
  Data = "/data/ne_50m_land.json",
}

enum LandCacheSchemaVersion {
  Current = 2,
}

enum LandDataErrorKind {
  InvalidGeometry = "The land data contains no valid polygons",
  RequestRejected = "The land data request failed",
}

class LandDataError extends Error {
  constructor(
    readonly kind: LandDataErrorKind,
    readonly httpStatus: number | null = null,
  ) {
    super(kind);
    this.name = LandDataError.name;
  }
}

type LandCache = Readonly<{
  schemaVersion: number;
  polygons: GeoMultiPolygon;
}>;

let landData: GeoMultiPolygon | null = null;
let loadInFlight: Promise<GeoMultiPolygon> | null = null;

function parseLandCache(value: unknown): LandCache | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== LandCacheSchemaVersion.Current) return null;
  const polygons = parseGeoMultiPolygonCoordinates(value.polygons);
  return polygons
    ? { schemaVersion: LandCacheSchemaVersion.Current, polygons }
    : null;
}

async function readCache(): Promise<GeoMultiPolygon | null> {
  const cached = parseLandCache(await cacheGet<unknown>(CacheKey.Land));
  return cached?.polygons ?? null;
}

function writeCache(polygons: GeoMultiPolygon): void {
  cacheSet(CacheKey.Land, {
    schemaVersion: LandCacheSchemaVersion.Current,
    polygons,
  } satisfies LandCache);
}

async function fetchLand(): Promise<GeoMultiPolygon> {
  const response = await fetch(LandAssetPath.Data);
  if (!response.ok) {
    throw new LandDataError(
      LandDataErrorKind.RequestRejected,
      response.status,
    );
  }
  const polygons = parseLandGeoJson(await response.json());
  if (polygons.length === 0) {
    throw new LandDataError(LandDataErrorKind.InvalidGeometry);
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
  loadLand().then(onReady).catch(() => undefined);
}
