import { isWeatherPoint } from "@/features/environmental/weather/data/codec";
import {
  type WeatherData,
  type WeatherPoint,
  weatherSeverityRank,
} from "@shared/domain/weather";
import {
  alwaysInTicker,
  createPointUiQueries,
  neverTickerPriority,
  noFilterFacet,
  type PointUiQuery,
  type PointUiQueryResult,
} from "@/workers/data/uiQuery";
import { joinSearchText } from "@shared/text";

export type WeatherUiQuery = PointUiQuery;
export type WeatherUiQueryResult = PointUiQueryResult<WeatherPoint>;

export function weatherSearchText(data: WeatherData): string {
  return joinSearchText([
    data.event,
    data.headline,
    data.areaDesc,
    data.severity,
    data.senderName,
  ]);
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
  includeInTable: () => true,
  matchesFilter: (_point, filter) => filter === true,
  includeInTicker: alwaysInTicker,
  tickerPriority: neverTickerPriority,
  filterFacet: noFilterFacet,
  supportsCorrelation: true,
});
