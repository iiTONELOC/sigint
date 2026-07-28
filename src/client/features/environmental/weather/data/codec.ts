import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import {
  hasOptionalFields,
  hasPointShape,
  isOptionalString,
  parsePointList,
} from "@/features/base/pointCodec";
import type {
  WeatherData,
  WeatherGeometry,
} from "@/features/environmental/weather/types";
import { isRecord } from "@shared/geo";

export type WeatherPoint = Extract<DataPoint, { type: Domain.Weather }>;

const STRING_FIELDS = [
  "event",
  "severity",
  "certainty",
  "urgency",
  "headline",
  "description",
  "instruction",
  "senderName",
  "areaDesc",
  "onset",
  "expires",
  "status",
  "messageType",
  "category",
  "response",
] as const;

export function isWeatherGeometry(
  value: unknown,
): value is WeatherGeometry {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    Array.isArray(value.coordinates)
  );
}

function isWeatherData(value: unknown): value is WeatherData {
  return (
    isRecord(value) &&
    hasOptionalFields(value, STRING_FIELDS, isOptionalString) &&
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
