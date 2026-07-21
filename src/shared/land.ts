import {
  geometryPolygons,
  isRecord,
  parseGeoJsonPolygonGeometry,
  type GeoMultiPolygon,
  type GeoPolygon,
} from "./geo";

const EMPTY_LAND: GeoMultiPolygon = [];

export function parseLandGeoJson(value: unknown): GeoMultiPolygon {
  if (!isRecord(value) || !Array.isArray(value.features)) return EMPTY_LAND;
  const polygons: GeoPolygon[] = [];
  for (const candidate of value.features) {
    if (!isRecord(candidate)) continue;
    const geometry = parseGeoJsonPolygonGeometry(candidate.geometry);
    if (geometry) polygons.push(...geometryPolygons(geometry));
  }
  return polygons;
}
