import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import {
  hasOptionalFields,
  hasPointShape,
  isOptionalString,
  parsePointList,
} from "@/features/base/pointCodec";
import {
  WEATHER_TEXT_FIELDS,
  type WeatherData,
} from "@/features/environmental/weather/types";
import {
  isRecord,
  parseGeoJsonPolygonGeometry,
  type GeoJsonPolygonGeometry,
} from "@shared/geo";

export type WeatherPoint = Extract<DataPoint, { type: Domain.Weather }>;

const SEVERITY_KEY: keyof WeatherData = "severity";

const TEXT_KEYS: readonly string[] = [...WEATHER_TEXT_FIELDS, SEVERITY_KEY];

function isWeatherGeometry(
  value: unknown,
): value is GeoJsonPolygonGeometry {
  return parseGeoJsonPolygonGeometry(value) !== null;
}

function isWeatherData(value: unknown): value is WeatherData {
  return (
    isRecord(value) &&
    hasOptionalFields(value, TEXT_KEYS, isOptionalString) &&
    (value.geometry === undefined || isWeatherGeometry(value.geometry))
  );
}

export function isWeatherPoint(value: unknown): value is WeatherPoint {
  return hasPointShape(value, Domain.Weather) && isWeatherData(value.data);
}

export function parseWeatherCache(
  value: unknown,
): readonly WeatherPoint[] | null {
  return parsePointList(value, isWeatherPoint);
}
