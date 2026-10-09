import { isCycloneWarningPoint } from "@/features/environmental/cyclones/data/warningCodec";
import { weatherSearchText } from "@/features/environmental/weather/data/uiQueries";
import {
  areaKindRank,
  type CycloneWarningPoint,
} from "@shared/domain/cyclones";
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

function alertName(point: CycloneWarningPoint): string {
  return point.data.event ?? point.id;
}

export const CYCLONE_WARNING_UI_QUERIES =
  createPointUiQueries<CycloneWarningPoint>({
    parseEntity: (value) => (isCycloneWarningPoint(value) ? value : null),
    searchText: (point) => weatherSearchText(point.data),
    primaryLabel: alertName,
    nameLabel: (point) => point.data.areaDesc ?? alertName(point),
    value1: (point) => areaKindRank(point.data.kind),
    value1Label: (point) => point.data.kind.toUpperCase(),
    value2: (point) => areaKindRank(point.data.kind),
    includeInTable: () => true,
    matchesFilter: () => true,
    includeInTicker: alwaysInTicker,
    tickerPriority: neverTickerPriority,
    filterFacet: noFilterFacet,
    supportsCorrelation: false,
  });
