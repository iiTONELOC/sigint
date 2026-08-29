import { Domain } from "@shared/domain/identity";
import {
  isOptionalString,
  parsePointList,
} from "@/features/base/pointCodec";
import {
  WeatherSeverity,
  WEATHER_TEXT_FIELDS,
  type WeatherData,
  type WeatherPoint,
} from "@shared/domain/weather";
import {
  isRecord,
  parseGeoJsonPolygonGeometry,
  parseGeoPoint,
  type GeoJsonPolygonGeometry,
} from "@shared/geo";
import { isEnumValue } from "@shared/types/enum";
import { hasOptionalFields } from "@shared/types/fields";

function isWeatherGeometry(
  value: unknown,
): value is GeoJsonPolygonGeometry {
  return parseGeoJsonPolygonGeometry(value) !== null;
}

function isWeatherData(value: unknown): value is WeatherData {
  return (
    isRecord(value) &&
    isEnumValue(value.severity, WeatherSeverity) &&
    hasOptionalFields(value, WEATHER_TEXT_FIELDS, isOptionalString) &&
    (value.geometry === undefined || isWeatherGeometry(value.geometry))
  );
}

export function isWeatherPoint(value: unknown): value is WeatherPoint {
  return (
    isRecord(value) &&
    value.type === Domain.Weather &&
    isOptionalString(value.id) &&
    value.id.length > 0 &&
    parseGeoPoint(value.position) !== null &&
    (value.timestamp === undefined || isOptionalString(value.timestamp)) &&
    isWeatherData(value.data)
  );
}

export function parseWeatherCache(
  value: unknown,
): readonly WeatherPoint[] | null {
  return parsePointList(value, isWeatherPoint);
}
