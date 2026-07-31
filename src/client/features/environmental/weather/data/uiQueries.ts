import { isWeatherPoint } from "@/features/environmental/weather/data/codec";
import { weatherSeverityRank } from "@/features/environmental/weather/severity";
import type {
  WeatherPoint,
  WeatherData,
  WeatherFilter,
} from "@/features/environmental/weather/types";
import {
  alwaysInTicker,
  createPointUiQueries,
  matchesThresholdFilter,
  neverTickerPriority,
  noFilterFacet,
  type PointUiQuery,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";
import { BLANK_SEPARATOR } from "@shared/text";

export type WeatherUiQuery = PointUiQuery;
export type WeatherUiQueryResult = PointUiQueryResult<WeatherPoint>;

const MIN_SEVERITY_KEY: keyof WeatherFilter = "minSeverity";

export function weatherSearchText(data: WeatherData): string {
  return [
    data.event,
    data.headline,
    data.areaDesc,
    data.severity,
    data.senderName,
  ]
    .filter((segment): segment is string => Boolean(segment))
    .join(BLANK_SEPARATOR);
}

function alertName(point: WeatherPoint): string {
  return point.data.event || point.id;
}

export const WEATHER_UI_QUERIES = createPointUiQueries<WeatherPoint>({
  parseEntity: (value) => (isWeatherPoint(value) ? value : null),
  searchText: (point) => weatherSearchText(point.data),
  primaryLabel: alertName,
  nameLabel: (point) => point.data.areaDesc ?? alertName(point),
  value1: (point) => weatherSeverityRank(point.data.severity),
  value1Label: (point) => point.data.severity,
  value2: () => 0,
  includeInTable: (point, minValue) =>
    weatherSeverityRank(point.data.severity) >= minValue,
  matchesFilter: (point, filter) =>
    matchesThresholdFilter(
      filter,
      MIN_SEVERITY_KEY,
      weatherSeverityRank(point.data.severity),
    ),
  includeInTicker: alwaysInTicker,
  tickerPriority: neverTickerPriority,
  filterFacet: noFilterFacet,
  supportsCorrelation: true,
});
