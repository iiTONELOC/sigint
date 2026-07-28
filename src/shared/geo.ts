export enum GeoJsonGeometryType {
  Polygon = "Polygon",
  MultiPolygon = "MultiPolygon",
}

export type GeoPoint = readonly [longitude: number, latitude: number];
export type GeoRing = readonly GeoPoint[];
export type GeoPolygon = readonly GeoRing[];
export type GeoMultiPolygon = readonly GeoPolygon[];

export type GeoJsonPolygon = Readonly<{
  type: GeoJsonGeometryType.Polygon;
  coordinates: GeoPolygon;
}>;

export type GeoJsonMultiPolygon = Readonly<{
  type: GeoJsonGeometryType.MultiPolygon;
  coordinates: GeoMultiPolygon;
}>;

export type GeoJsonPolygonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

export type GeoBounds = Readonly<{
  minLongitude: number;
  maxLongitude: number;
  minLatitude: number;
  maxLatitude: number;
}>;

const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;
const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;
const MIN_RING_POINT_COUNT = 4;
const FULL_LONGITUDE_SPAN = 360;
const HALF_LONGITUDE_SPAN = FULL_LONGITUDE_SPAN / 2;

export function isRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createGeoPoint(
  longitude: number,
  latitude: number,
): GeoPoint | null {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < MIN_LONGITUDE || longitude > MAX_LONGITUDE) return null;
  if (latitude < MIN_LATITUDE || latitude > MAX_LATITUDE) return null;
  return [longitude, latitude];
}

export function parseGeoPoint(value: unknown): GeoPoint | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = value[0];
  const latitude = value[1];
  if (typeof longitude !== "number" || typeof latitude !== "number") return null;
  return createGeoPoint(longitude, latitude);
}

export function parseGeoRing(value: unknown): GeoRing | null {
  if (!Array.isArray(value)) return null;
  const points: GeoPoint[] = [];
  for (const coordinate of value) {
    const point = parseGeoPoint(coordinate);
    if (!point) return null;
    points.push(point);
  }
  return points.length >= MIN_RING_POINT_COUNT ? points : null;
}

export function parseGeoPolygonCoordinates(value: unknown): GeoPolygon | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rings: GeoRing[] = [];
  for (const candidate of value) {
    const ring = parseGeoRing(candidate);
    if (!ring) return null;
    rings.push(ring);
  }
  return rings;
}

export function parseGeoMultiPolygonCoordinates(
  value: unknown,
): GeoMultiPolygon | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const polygons: GeoPolygon[] = [];
  for (const candidate of value) {
    const polygon = parseGeoPolygonCoordinates(candidate);
    if (!polygon) return null;
    polygons.push(polygon);
  }
  return polygons;
}

export function parseGeoJsonPolygonGeometry(
  value: unknown,
): GeoJsonPolygonGeometry | null {
  if (!isRecord(value)) return null;
  if (value.type === GeoJsonGeometryType.Polygon) {
    const coordinates = parseGeoPolygonCoordinates(value.coordinates);
    return coordinates
      ? { type: GeoJsonGeometryType.Polygon, coordinates }
      : null;
  }
  if (value.type === GeoJsonGeometryType.MultiPolygon) {
    const coordinates = parseGeoMultiPolygonCoordinates(value.coordinates);
    return coordinates
      ? { type: GeoJsonGeometryType.MultiPolygon, coordinates }
      : null;
  }
  return null;
}

export function geometryPolygons(
  geometry: GeoJsonPolygonGeometry,
): GeoMultiPolygon {
  return geometry.type === GeoJsonGeometryType.Polygon
    ? [geometry.coordinates]
    : geometry.coordinates;
}

export function unwrapLongitude(
  longitude: number,
  referenceLongitude: number,
): number {
  // Keep antimeridian neighbors in one local longitude frame.
  let unwrapped = longitude;
  while (unwrapped - referenceLongitude > HALF_LONGITUDE_SPAN) {
    unwrapped -= FULL_LONGITUDE_SPAN;
  }
  while (unwrapped - referenceLongitude < -HALF_LONGITUDE_SPAN) {
    unwrapped += FULL_LONGITUDE_SPAN;
  }
  return unwrapped;
}

export function ringContainsPoint(point: GeoPoint, ring: GeoRing): boolean {
  // Ray-cast in the ring's longitude frame so wrapped rings stay contiguous.
  const [longitude, latitude] = point;
  const ringReferenceLongitude = ring[0]?.[0];
  if (ringReferenceLongitude === undefined) return false;
  const testLongitude = unwrapLongitude(longitude, ringReferenceLongitude);
  let inside = false;
  for (let index = 0; index < ring.length; index += 1) {
    const previous = index === 0 ? ring.length - 1 : index - 1;
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;
    const currentLongitude = unwrapLongitude(
      currentPoint[0],
      ringReferenceLongitude,
    );
    const currentLatitude = currentPoint[1];
    const previousLongitude = unwrapLongitude(
      previousPoint[0],
      ringReferenceLongitude,
    );
    const previousLatitude = previousPoint[1];
    if ((currentLatitude > latitude) === (previousLatitude > latitude)) continue;
    const crossingLongitude =
      ((previousLongitude - currentLongitude) *
        (latitude - currentLatitude)) /
        (previousLatitude - currentLatitude) +
      currentLongitude;
    if (testLongitude < crossingLongitude) inside = !inside;
  }
  return inside;
}

export function polygonContainsPoint(
  point: GeoPoint,
  polygon: GeoPolygon,
): boolean {
  const exterior = polygon[0];
  if (!exterior || !ringContainsPoint(point, exterior)) return false;
  // Interior rings remove their area from the exterior land surface.
  for (let index = 1; index < polygon.length; index += 1) {
    const hole = polygon[index];
    if (hole && ringContainsPoint(point, hole)) return false;
  }
  return true;
}

export function multiPolygonContainsPoint(
  point: GeoPoint,
  polygons: GeoMultiPolygon,
): boolean {
  return polygons.some((polygon) => polygonContainsPoint(point, polygon));
}

export function ringBounds(ring: GeoRing): GeoBounds | null {
  const first = ring[0];
  if (!first) return null;
  let minLongitude = first[0];
  let maxLongitude = first[0];
  let minLatitude = first[1];
  let maxLatitude = first[1];
  for (let index = 1; index < ring.length; index += 1) {
    const point = ring[index];
    if (!point) continue;
    minLongitude = Math.min(minLongitude, point[0]);
    maxLongitude = Math.max(maxLongitude, point[0]);
    minLatitude = Math.min(minLatitude, point[1]);
    maxLatitude = Math.max(maxLatitude, point[1]);
  }
  return { minLongitude, maxLongitude, minLatitude, maxLatitude };
}

export function interpolateGeoPoint(
  start: GeoPoint,
  end: GeoPoint,
  ratio: number,
): GeoPoint {
  // Interpolate across the shortest longitude span at the antimeridian.
  const endLongitude = unwrapLongitude(end[0], start[0]);
  let longitude = start[0] + (endLongitude - start[0]) * ratio;
  if (longitude > MAX_LONGITUDE) longitude -= FULL_LONGITUDE_SPAN;
  if (longitude < MIN_LONGITUDE) longitude += FULL_LONGITUDE_SPAN;
  return [longitude, start[1] + (end[1] - start[1]) * ratio];
}
