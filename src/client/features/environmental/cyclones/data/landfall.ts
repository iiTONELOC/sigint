import {
  createGeoPoint,
  interpolateGeoPoint,
  multiPolygonContainsPoint,
  unwrapLongitude,
  type GeoMultiPolygon,
  type GeoPoint,
} from "@shared/geo";
import type { ForecastPoint } from "@shared/domain/cyclones";

export enum LandfallKind {
  Onshore = "onshore",
  EstimatedArrival = "eta",
  None = "none",
  Indeterminate = "indeterminate",
}

export type Landfall =
  | Readonly<{ kind: LandfallKind.Onshore; position: GeoPoint }>
  | Readonly<{
      kind: LandfallKind.EstimatedArrival;
      fcstHour: number;
      validTime: string;
      position: GeoPoint;
    }>
  | Readonly<{ kind: LandfallKind.None }>
  | Readonly<{ kind: LandfallKind.Indeterminate }>;

type CoastSegment = Readonly<{
  start: GeoPoint;
  end: GeoPoint;
  minLatitude: number;
  maxLatitude: number;
}>;

export type LandfallIndex = Readonly<{
  polygons: GeoMultiPolygon;
  coastSegments: readonly CoastSegment[];
}>;

type TrackNode = Readonly<{
  point: GeoPoint;
  forecastHour: number;
  validTime: string;
  validTimeMs: number;
}>;

enum LandfallCalculation {
  IntersectionEpsilon = 1e-9,
  CrossingSampleRatio = 1e-5,
}

function samePoint(first: GeoPoint, second: GeoPoint): boolean {
  return first[0] === second[0] && first[1] === second[1];
}

export function createLandfallIndex(
  polygons: GeoMultiPolygon,
): LandfallIndex {
  const coastSegments: CoastSegment[] = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let index = 0; index < ring.length; index += 1) {
        const start = ring[index];
        const end = ring[(index + 1) % ring.length];
        if (!start || !end || samePoint(start, end)) continue;
        coastSegments.push({
          start,
          end,
          minLatitude: Math.min(start[1], end[1]),
          maxLatitude: Math.max(start[1], end[1]),
        });
      }
    }
  }
  return { polygons, coastSegments };
}

function cross(
  firstX: number,
  firstY: number,
  secondX: number,
  secondY: number,
): number {
  return firstX * secondY - firstY * secondX;
}

function intersectionRatio(
  trackStart: GeoPoint,
  trackEnd: GeoPoint,
  coast: CoastSegment,
): number | null {
  // Solve both segments in the track's local antimeridian frame.
  const trackStartLongitude = trackStart[0];
  const trackEndLongitude = unwrapLongitude(trackEnd[0], trackStartLongitude);
  const coastStartLongitude = unwrapLongitude(
    coast.start[0],
    trackStartLongitude,
  );
  const coastEndLongitude = unwrapLongitude(
    coast.end[0],
    coastStartLongitude,
  );

  const trackDeltaLongitude = trackEndLongitude - trackStartLongitude;
  const trackDeltaLatitude = trackEnd[1] - trackStart[1];
  const coastDeltaLongitude = coastEndLongitude - coastStartLongitude;
  const coastDeltaLatitude = coast.end[1] - coast.start[1];
  const denominator = cross(
    trackDeltaLongitude,
    trackDeltaLatitude,
    coastDeltaLongitude,
    coastDeltaLatitude,
  );
  if (Math.abs(denominator) <= LandfallCalculation.IntersectionEpsilon) {
    return null;
  }

  const offsetLongitude = coastStartLongitude - trackStartLongitude;
  const offsetLatitude = coast.start[1] - trackStart[1];
  const trackRatio =
    cross(
      offsetLongitude,
      offsetLatitude,
      coastDeltaLongitude,
      coastDeltaLatitude,
    ) / denominator;
  const coastRatio =
    cross(
      offsetLongitude,
      offsetLatitude,
      trackDeltaLongitude,
      trackDeltaLatitude,
    ) / denominator;

  if (
    trackRatio < -LandfallCalculation.IntersectionEpsilon ||
    trackRatio > 1 + LandfallCalculation.IntersectionEpsilon ||
    coastRatio < -LandfallCalculation.IntersectionEpsilon ||
    coastRatio > 1 + LandfallCalculation.IntersectionEpsilon
  ) {
    return null;
  }
  return Math.min(1, Math.max(0, trackRatio));
}

function crossingRatios(
  start: GeoPoint,
  end: GeoPoint,
  index: LandfallIndex,
): number[] {
  const minLatitude = Math.min(start[1], end[1]);
  const maxLatitude = Math.max(start[1], end[1]);
  const ratios: number[] = [];
  for (const coast of index.coastSegments) {
    if (
      coast.maxLatitude < minLatitude ||
      coast.minLatitude > maxLatitude
    ) {
      continue;
    }
    const ratio = intersectionRatio(start, end, coast);
    if (ratio === null) continue;
    if (
      ratios.some(
        (existing) =>
          Math.abs(existing - ratio) <=
          LandfallCalculation.IntersectionEpsilon,
      )
    ) {
      continue;
    }
    ratios.push(ratio);
  }
  return ratios.sort((first, second) => first - second);
}

function firstWaterToLandRatio(
  start: GeoPoint,
  end: GeoPoint,
  index: LandfallIndex,
): number | null {
  for (const ratio of crossingRatios(start, end, index)) {
    // Samples around the boundary distinguish landfall from an offshore exit.
    const before = interpolateGeoPoint(
      start,
      end,
      Math.max(0, ratio - LandfallCalculation.CrossingSampleRatio),
    );
    const after = interpolateGeoPoint(
      start,
      end,
      Math.min(1, ratio + LandfallCalculation.CrossingSampleRatio),
    );
    if (
      !multiPolygonContainsPoint(before, index.polygons) &&
      multiPolygonContainsPoint(after, index.polygons)
    ) {
      return ratio;
    }
  }
  return null;
}

function createTrackNode(
  point: GeoPoint,
  forecastHour: number,
  validTime: string,
): TrackNode | null {
  const validTimeMs = Date.parse(validTime);
  if (!Number.isFinite(validTimeMs)) return null;
  return { point, forecastHour, validTime, validTimeMs };
}

function forecastNode(forecast: ForecastPoint): TrackNode | null {
  const point = createGeoPoint(forecast.lon, forecast.lat);
  return point
    ? createTrackNode(point, forecast.fcstHour, forecast.validTime)
    : null;
}

export function assessLandfall(
  current: GeoPoint,
  currentValidTime: string,
  forecast: readonly ForecastPoint[],
  index: LandfallIndex,
): Landfall {
  if (index.polygons.length === 0 || index.coastSegments.length === 0) {
    return { kind: LandfallKind.Indeterminate };
  }
  if (multiPolygonContainsPoint(current, index.polygons)) {
    return { kind: LandfallKind.Onshore, position: current };
  }
  const currentNode = createTrackNode(current, 0, currentValidTime);
  if (!currentNode) return { kind: LandfallKind.Indeterminate };

  const orderedForecast = [...forecast].sort(
    (first, second) => first.fcstHour - second.fcstHour,
  );
  const nodes: TrackNode[] = [currentNode];
  for (const candidate of orderedForecast) {
    const node = forecastNode(candidate);
    if (!node) return { kind: LandfallKind.Indeterminate };
    nodes.push(node);
  }

  for (let indexPosition = 1; indexPosition < nodes.length; indexPosition += 1) {
    const start = nodes[indexPosition - 1];
    const end = nodes[indexPosition];
    if (!start || !end) continue;
    const ratio = firstWaterToLandRatio(start.point, end.point, index);
    if (ratio === null) continue;
    const forecastHour =
      start.forecastHour +
      (end.forecastHour - start.forecastHour) * ratio;
    const validTimeMs =
      start.validTimeMs + (end.validTimeMs - start.validTimeMs) * ratio;
    return {
      kind: LandfallKind.EstimatedArrival,
      fcstHour: forecastHour,
      validTime: new Date(validTimeMs).toISOString(),
      position: interpolateGeoPoint(start.point, end.point, ratio),
    };
  }
  return { kind: LandfallKind.None };
}
