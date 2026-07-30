import {
  isEventPoint,
  type EventPoint,
} from "@/features/intel/events/data/codec";
import {
  alwaysInTicker,
  createPointUiQueries,
  matchesThresholdFilter,
  neverTickerPriority,
  noFilterFacet,
  type PointUiQuery,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";

export type EventUiQuery = PointUiQuery;
export type EventUiQueryResult = PointUiQueryResult<EventPoint>;

function headline(point: EventPoint): string {
  return point.data.headline || point.id;
}

export const EVENT_UI_QUERIES = createPointUiQueries<EventPoint>({
  parseEntity: (value) => (isEventPoint(value) ? value : null),
  searchText: (point) =>
    [
      point.data.headline,
      point.data.category,
      point.data.locationName,
      point.data.sourceCountry,
      point.data.actor1,
      point.data.actor2,
    ]
      .filter((segment): segment is string => Boolean(segment))
      .join(" "),
  primaryLabel: headline,
  nameLabel: (point) => point.data.locationName ?? headline(point),
  value1: (point) => point.data.severity ?? 1,
  value1Label: (point) => point.data.category ?? "",
  value2: (point) => point.data.mentions ?? 0,
  includeInTable: (point, minValue) =>
    (point.data.severity ?? 1) >= minValue,
  matchesFilter: (point, filter) =>
    matchesThresholdFilter(
      filter,
      "minSeverity",
      point.data.severity ?? null,
    ),
  includeInTicker: alwaysInTicker,
  tickerPriority: neverTickerPriority,
  filterFacet: noFilterFacet,
  supportsCorrelation: true,
});
