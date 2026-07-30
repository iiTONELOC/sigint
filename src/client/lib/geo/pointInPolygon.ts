import {
  createGeoPoint,
  geometryPolygons,
  multiPolygonContainsPoint,
  parseGeoJsonPolygonGeometry,
  ringContainsPoint,
  type GeoRing,
} from "@shared/geo";

export type Ring = GeoRing;

export function ringContains(
  latitude: number,
  longitude: number,
  ring: Ring,
): boolean {
  const point = createGeoPoint(longitude, latitude);
  return point ? ringContainsPoint(point, ring) : false;
}

export function pointInPolygon(
  latitude: number,
  longitude: number,
  value: unknown,
): boolean {
  const point = createGeoPoint(longitude, latitude);
  const geometry = parseGeoJsonPolygonGeometry(value);
  return point && geometry
    ? multiPolygonContainsPoint(point, geometryPolygons(geometry))
    : false;
}

export function geometryCentroid(
  value: unknown,
): { lat: number; lon: number } | null {
  const geometry = parseGeoJsonPolygonGeometry(value);
  if (!geometry) return null;
  const exterior = geometryPolygons(geometry)[0]?.[0];
  if (!exterior || exterior.length === 0) return null;
  let longitudeTotal = 0;
  let latitudeTotal = 0;
  for (const [longitude, latitude] of exterior) {
    longitudeTotal += longitude;
    latitudeTotal += latitude;
  }
  return {
    lat: latitudeTotal / exterior.length,
    lon: longitudeTotal / exterior.length,
  };
}
