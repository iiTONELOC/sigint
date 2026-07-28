import {
  isCycloneWarningPoint,
  type CycloneWarningPoint,
} from "@/features/environmental/cyclones/data/warningCodec";
import {
  alwaysInTicker,
  createPointUiQueries,
  neverTickerPriority,
  noFilterFacet,
  type PointUiQuery,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";

export type CycloneWarningUiQuery = PointUiQuery;
export type CycloneWarningUiQueryResult =
  PointUiQueryResult<CycloneWarningPoint>;

const WARNING_RANK = 2;
const WATCH_RANK = 1;

export const CYCLONE_WARNING_UI_QUERIES =
  createPointUiQueries<CycloneWarningPoint>({
    parseEntity: (value) => (isCycloneWarningPoint(value) ? value : null),
    searchText: (point) =>
      [point.data.event, point.data.headline, point.data.areaDesc]
        .filter((segment): segment is string => Boolean(segment))
        .join(" "),
    primaryLabel: (point) => point.data.event,
    nameLabel: (point) => point.data.areaDesc,
    value1: (point) =>
      point.data.kind === "warning" ? WARNING_RANK : WATCH_RANK,
    value1Label: (point) => point.data.kind.toUpperCase(),
    value2: (point) =>
      point.data.kind === "warning" ? WARNING_RANK : WATCH_RANK,
    includeInTable: () => true,
    matchesFilter: () => true,
    includeInTicker: alwaysInTicker,
    tickerPriority: neverTickerPriority,
    filterFacet: noFilterFacet,
    supportsCorrelation: false,
  });
