import {
  parseEarthquakePoint,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import {
  findPointSearchIds,
  parsePointUiQuery,
  parsePointUiQueryResult,
  runPointUiQuery,
  type PointUiQuery,
  type PointUiQueryDescriptor,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";

export type { TableSortDirection, TableSortKey } from "@/workers/data/uiQuery";

export type EarthquakeUiQuery = PointUiQuery;
export type EarthquakeUiQueryResult = PointUiQueryResult<EarthquakePoint>;

export { POINT_UI_QUERY_POLICY as EARTHQUAKE_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";

function magnitudeLabel(point: EarthquakePoint): string {
  return point.data.magnitude === undefined
    ? ""
    : `M${point.data.magnitude}`;
}

export const EARTHQUAKE_UI_QUERY: PointUiQueryDescriptor<EarthquakePoint> = {
  parseEntity: parseEarthquakePoint,
  searchText: (point) =>
    [
      point.data.location,
      magnitudeLabel(point),
      point.data.alert,
      point.data.eventType,
    ]
      .filter((segment): segment is string => Boolean(segment))
      .join(" "),
  primaryLabel: (point) => point.data.location || point.id,
  nameLabel: (point) => point.data.location || point.id,
  value1: (point) => point.data.magnitude ?? 0,
  value1Label: magnitudeLabel,
  value2: (point) => point.data.depth ?? 0,
  includeInTable: (point, minValue) => {
    const magnitude = point.data.magnitude;
    return !(magnitude !== undefined && minValue > 0 && magnitude < minValue);
  },
  supportsCorrelation: true,
};

export function parseEarthquakeUiQuery(
  value: unknown,
): EarthquakeUiQuery | null {
  return parsePointUiQuery(
    value,
    EARTHQUAKE_UI_QUERY.supportsCorrelation,
  );
}

export function parseEarthquakeUiQueryResult(
  value: unknown,
): EarthquakeUiQueryResult | null {
  return parsePointUiQueryResult(value, EARTHQUAKE_UI_QUERY.parseEntity);
}

export function findEarthquakeSearchIds(
  points: readonly EarthquakePoint[],
  text: string,
): string[] {
  return findPointSearchIds(points, text, EARTHQUAKE_UI_QUERY);
}

export function runEarthquakeUiQuery(
  points: readonly EarthquakePoint[],
  query: EarthquakeUiQuery,
  now: number = Date.now(),
): EarthquakeUiQueryResult {
  return runPointUiQuery(points, query, EARTHQUAKE_UI_QUERY, now);
}
