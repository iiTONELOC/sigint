import {
  isCyclonePoint,
  type CyclonePoint,
} from "@/features/environmental/cyclones/data/codec";
import {
  alwaysInTicker,
  createPointUiQueries,
  matchesThresholdFilter,
  neverTickerPriority,
  noFilterFacet,
  type PointUiQuery,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";

export type CycloneUiQuery = PointUiQuery;
export type CycloneUiQueryResult = PointUiQueryResult<CyclonePoint>;

export const CYCLONE_UI_QUERIES = createPointUiQueries<CyclonePoint>({
  parseEntity: (value) => (isCyclonePoint(value) ? value : null),
  searchText: (point) =>
    [point.data.name, point.data.stormId, point.data.basin]
      .filter((segment): segment is string => Boolean(segment))
      .join(" "),
  primaryLabel: (point) => point.data.name,
  nameLabel: (point) => point.data.classification,
  value1: (point) => point.data.maxWindKt,
  value1Label: (point) => point.data.classification,
  value2: (point) => point.data.saffirSimpson,
  includeInTable: (point, minValue) => point.data.maxWindKt >= minValue,
  matchesFilter: (point, filter) =>
    matchesThresholdFilter(
      filter,
      "minCategory",
      point.data.saffirSimpson,
    ),
  includeInTicker: alwaysInTicker,
  tickerPriority: neverTickerPriority,
  filterFacet: noFilterFacet,
  supportsCorrelation: true,
});
