import type { GeoJsonPolygonGeometry } from "@shared/geo";
import type { WeatherSeverity } from "./severity";

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

export type WeatherFilter = {
  enabled: boolean;
  minSeverity: number;
};
