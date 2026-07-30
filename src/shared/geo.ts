export enum GeoJsonGeometryType {
  Polygon = "Polygon",
  MultiPolygon = "MultiPolygon",
}

export type GeoPoint = readonly [longitude: number, latitude: number];

export function longitudeOf(point: GeoPoint): number {
  return point[0];
}

export function latitudeOf(point: GeoPoint): number {
  return point[1];
}

export function geoPointsEqual(left: GeoPoint, right: GeoPoint): boolean {
  return left[0] === right[0] && left[1] === right[1];
}
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

export enum GeoLimit {
  MinLongitude = -180,
  MaxLongitude = 180,
  MinLatitude = -90,
  MaxLatitude = 90,
  MinRingPointCount = 4,
  FullLongitudeSpan = 360,
  NullIslandDegrees = 0,
}

const HALF_LONGITUDE_SPAN = GeoLimit.FullLongitudeSpan / 2;

export enum TurnDeg {
  Quarter = 90,
  Half = 180,
  Full = 360,
}

export enum GeoMeasurement {
  MetersPerKilometer = 1_000,
  EarthRadiusKilometers = 6_371,
  EarthRadiusMeters = 6_371_000,
}

export enum AngleConversion {
  RadiansPerDegree = 0.017453292519943295,
}

export const METERS_PER_KM = GeoMeasurement.MetersPerKilometer;
export const EARTH_RADIUS_KM = GeoMeasurement.EarthRadiusKilometers;
export const EARTH_RADIUS_METERS = GeoMeasurement.EarthRadiusMeters;
export const DEGREES_TO_RADIANS =
  AngleConversion.RadiansPerDegree;

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = (lat2 - lat1) * AngleConversion.RadiansPerDegree;
  const dLon = (lon2 - lon1) * AngleConversion.RadiansPerDegree;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * AngleConversion.RadiansPerDegree) *
      Math.cos(lat2 * AngleConversion.RadiansPerDegree) *
      Math.sin(dLon / 2) ** 2;
  return (
    GeoMeasurement.EarthRadiusKilometers *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

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
  if (longitude < GeoLimit.MinLongitude || longitude > GeoLimit.MaxLongitude) return null;
  if (latitude < GeoLimit.MinLatitude || latitude > GeoLimit.MaxLatitude) return null;
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
  const first = points[0];
  const last = points.at(-1);
  return points.length >= GeoLimit.MinRingPointCount &&
    first !== undefined &&
    last !== undefined &&
    geoPointsEqual(first, last)
    ? points
    : null;
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

function geoRingsEqual(left: GeoRing, right: GeoRing): boolean {
  return (
    left.length === right.length &&
    left.every((point, index) => {
      const other = right[index];
      return other !== undefined && geoPointsEqual(point, other);
    })
  );
}

function geoPolygonsEqual(
  left: GeoPolygon,
  right: GeoPolygon,
): boolean {
  return (
    left.length === right.length &&
    left.every((ring, index) => {
      const other = right[index];
      return other !== undefined && geoRingsEqual(ring, other);
    })
  );
}

export function geoPolygonGeometryEqual(
  left: GeoJsonPolygonGeometry | undefined,
  right: GeoJsonPolygonGeometry | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  const leftPolygons = geometryPolygons(left);
  const rightPolygons = geometryPolygons(right);
  return (
    leftPolygons.length === rightPolygons.length &&
    leftPolygons.every((polygon, index) => {
      const other = rightPolygons[index];
      return other !== undefined && geoPolygonsEqual(polygon, other);
    })
  );
}

function ringCentroid(ring: GeoRing): GeoPoint | null {
  if (ring.length === 0) return null;
  let longitudeTotal = 0;
  let latitudeTotal = 0;
  for (const point of ring) {
    longitudeTotal += longitudeOf(point);
    latitudeTotal += latitudeOf(point);
  }
  return createGeoPoint(
    longitudeTotal / ring.length,
    latitudeTotal / ring.length,
  );
}

export function geometryCentroid(
  geometry: GeoJsonPolygonGeometry,
): GeoPoint | null {
  const [firstPolygon] = geometryPolygons(geometry);
  const [outerRing] = firstPolygon ?? [];
  return outerRing ? ringCentroid(outerRing) : null;
}

export function isNullIsland(point: GeoPoint): boolean {
  return (
    longitudeOf(point) === GeoLimit.NullIslandDegrees &&
    latitudeOf(point) === GeoLimit.NullIslandDegrees
  );
}

export function unwrapLongitude(
  longitude: number,
  referenceLongitude: number,
): number {
  // Keep antimeridian neighbors in one local longitude frame.
  let unwrapped = longitude;
  while (unwrapped - referenceLongitude > HALF_LONGITUDE_SPAN) {
    unwrapped -= GeoLimit.FullLongitudeSpan;
  }
  while (unwrapped - referenceLongitude < -HALF_LONGITUDE_SPAN) {
    unwrapped += GeoLimit.FullLongitudeSpan;
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
  if (longitude > GeoLimit.MaxLongitude) longitude -= GeoLimit.FullLongitudeSpan;
  if (longitude < GeoLimit.MinLongitude) longitude += GeoLimit.FullLongitudeSpan;
  return [longitude, start[1] + (end[1] - start[1]) * ratio];
}
