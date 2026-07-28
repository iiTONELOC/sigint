import {
  isWeatherPoint,
  type WeatherPoint,
} from "@/features/environmental/weather/data/codec";
import { weatherSeverityRank } from "@/features/environmental/weather/severity";
import {
  alwaysInTicker,
  createPointUiQueries,
  matchesThresholdFilter,
  neverTickerPriority,
  noFilterFacet,
  type PointUiQuery,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";

export type WeatherUiQuery = PointUiQuery;
export type WeatherUiQueryResult = PointUiQueryResult<WeatherPoint>;

function alertName(point: WeatherPoint): string {
  return point.data.event || point.id;
}

export const WEATHER_UI_QUERIES = createPointUiQueries<WeatherPoint>({
  parseEntity: (value) => (isWeatherPoint(value) ? value : null),
  searchText: (point) =>
    [
      point.data.event,
      point.data.headline,
      point.data.areaDesc,
      point.data.severity,
      point.data.senderName,
    ]
      .filter((segment): segment is string => Boolean(segment))
      .join(" "),
  primaryLabel: alertName,
  nameLabel: (point) => point.data.areaDesc ?? alertName(point),
  value1: (point) => weatherSeverityRank(point.data.severity),
  value1Label: (point) => point.data.severity ?? "",
  value2: () => 0,
  includeInTable: (point, minValue) =>
    weatherSeverityRank(point.data.severity) >= minValue,
  matchesFilter: (point, filter) =>
    matchesThresholdFilter(
      filter,
      "minSeverity",
      weatherSeverityRank(point.data.severity),
    ),
  includeInTicker: alwaysInTicker,
  tickerPriority: neverTickerPriority,
  filterFacet: noFilterFacet,
  supportsCorrelation: true,
});
