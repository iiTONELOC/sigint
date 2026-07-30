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
