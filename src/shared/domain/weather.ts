import type { GeoJsonPolygonGeometry, GeoPoint } from "../geo";
import { isEnumValue } from "../types/enum";
import type { Domain } from "./identity";

export enum WeatherSeverity {
  Unknown = "Unknown",
  Minor = "Minor",
  Moderate = "Moderate",
  Severe = "Severe",
  Extreme = "Extreme",
}

const WEATHER_SEVERITIES: readonly WeatherSeverity[] =
  Object.values(WeatherSeverity);

export function parseWeatherSeverity(value: unknown): WeatherSeverity {
  return isEnumValue(value, WeatherSeverity) ? value : WeatherSeverity.Unknown;
}

export function weatherSeverityRank(severity: WeatherSeverity): number {
  return WEATHER_SEVERITIES.indexOf(severity);
}

export function weatherSeverityFromRank(rank: number): WeatherSeverity {
  return WEATHER_SEVERITIES[rank] ?? WeatherSeverity.Unknown;
}

export enum WeatherTextField {
  Event = "event",
  Urgency = "urgency",
  Certainty = "certainty",
  Category = "category",
  Response = "response",
  Issuer = "senderName",
  Area = "areaDesc",
  Onset = "onset",
  Expires = "expires",
  Headline = "headline",
  Description = "description",
  Instruction = "instruction",
  Status = "status",
  MessageType = "messageType",
}

export const WEATHER_TEXT_FIELDS: readonly WeatherTextField[] =
  Object.values(WeatherTextField);

export type WeatherData = Partial<Record<WeatherTextField, string>> & {
  geometry?: GeoJsonPolygonGeometry;
  severity: WeatherSeverity;
};

export type WeatherPoint = {
  id: string;
  type: Domain.Weather;
  position: GeoPoint;
  timestamp?: string;
  data: WeatherData;
};
