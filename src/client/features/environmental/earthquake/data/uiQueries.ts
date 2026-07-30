import {
  parseEarthquakePoint,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import {
  alwaysInTicker,
  createPointUiQueries,
  matchesThresholdFilter,
  neverTickerPriority,
  noFilterFacet,
  type PointUiQuery,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";

export type { TableSortDirection, TableSortKey } from "@/workers/data/uiQuery";

export type EarthquakeUiQuery = PointUiQuery;
export type EarthquakeUiQueryResult = PointUiQueryResult<EarthquakePoint>;


function magnitudeLabel(point: EarthquakePoint): string {
  return point.data.magnitude === undefined
    ? ""
    : `M${point.data.magnitude}`;
}

export const EARTHQUAKE_UI_QUERIES = createPointUiQueries<EarthquakePoint>({
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
  matchesFilter: (point, filter) =>
    matchesThresholdFilter(filter, "minMagnitude", point.data.magnitude ?? null),
  includeInTicker: alwaysInTicker,
  tickerPriority: neverTickerPriority,
  filterFacet: noFilterFacet,
  supportsCorrelation: true,
});
