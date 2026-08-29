import { isCycloneWarningPoint } from "@/features/environmental/cyclones/data/warningCodec";
import {
  CycloneWarningField,
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
import { BLANK_SEPARATOR } from "@shared/text";

export type CycloneWarningUiQuery = PointUiQuery;
export type CycloneWarningUiQueryResult =
  PointUiQueryResult<CycloneWarningPoint>;

const SEARCH_FIELDS: readonly CycloneWarningField[] = [
  CycloneWarningField.Alert,
  CycloneWarningField.Headline,
  CycloneWarningField.Area,
];

export const CYCLONE_WARNING_UI_QUERIES =
  createPointUiQueries<CycloneWarningPoint>({
    parseEntity: (value) => (isCycloneWarningPoint(value) ? value : null),
    searchText: (point) =>
      SEARCH_FIELDS.map((field) => point.data[field])
        .filter(Boolean)
        .join(BLANK_SEPARATOR),
    primaryLabel: (point) => point.data[CycloneWarningField.Alert],
    nameLabel: (point) => point.data[CycloneWarningField.Area],
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
