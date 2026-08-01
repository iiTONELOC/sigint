import {
  fireConfidenceLevel,
  parseFirePoint,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import {
  alwaysInTicker,
  createPointUiQueries,
  matchesThresholdFilter,
  neverTickerPriority,
  noFilterFacet,
  type PointUiQuery,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";
import { FireDayNight } from "@shared/domain/fireDayNight";
import { stringEnumMemberName } from "@shared/types/enum";
import { FireCopy, formatFirePower } from "../formatters";

export type { TableSortDirection, TableSortKey } from "@/workers/data/uiQuery";

export type FireUiQuery = PointUiQuery;
export type FireUiQueryResult = PointUiQueryResult<FirePoint>;

function radiativePowerLabel(point: FirePoint): string {
  return point.data.frp === undefined
    ? ""
    : `${FireCopy.RadiativePower}${point.data.frp}`;
}

function hotspotName(point: FirePoint): string {
  return point.data.frp === undefined
    ? FireCopy.Hotspot
    : `${FireCopy.RadiativePower} ${formatFirePower(point.data.frp)}`;
}

export function fireDayNightSearchTerm(value: string | undefined): string {
  return stringEnumMemberName(value, FireDayNight)?.toLowerCase() ?? "";
}

function dayNightLabel(point: FirePoint): string {
  return fireDayNightSearchTerm(point.data.daynight);
}

export const FIRE_UI_QUERIES = createPointUiQueries<FirePoint>({
  parseEntity: parseFirePoint,
  searchText: (point) =>
    [
      point.data.confidence,
      point.data.satellite,
      radiativePowerLabel(point),
      dayNightLabel(point),
    ]
      .filter((segment): segment is string => Boolean(segment))
      .join(" "),
  primaryLabel: (point) => point.id,
  nameLabel: hotspotName,
  value1: (point) => point.data.frp ?? 0,
  value1Label: (point) => point.data.confidence?.toUpperCase() ?? "",
  value2: (point) => point.data.brightness ?? 0,
  includeInTable: (point, minValue) =>
    fireConfidenceLevel(point.data.confidence) >= minValue,
  matchesFilter: (point, filter) =>
    matchesThresholdFilter(
      filter,
      "minConfidence",
      fireConfidenceLevel(point.data.confidence),
    ),
  includeInTicker: alwaysInTicker,
  tickerPriority: neverTickerPriority,
  filterFacet: noFilterFacet,
  supportsCorrelation: false,
});
