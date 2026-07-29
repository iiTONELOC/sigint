import { isEnumValue } from "@shared/types/enum";

export enum WeatherSeverity {
  Unknown = "Unknown",
  Minor = "Minor",
  Moderate = "Moderate",
  Severe = "Severe",
  Extreme = "Extreme",
}

const INK_UNKNOWN = "#6b7a8d";
const INK_MINOR = "#5c7cfa";
const INK_MODERATE = "#9775fa";
const INK_SEVERE = "#cc5de8";
const INK_EXTREME = "#e64980";

const SEVERITY_ORDER: readonly WeatherSeverity[] =
  Object.values(WeatherSeverity);

const SEVERITY_INK: Readonly<Record<WeatherSeverity, string>> = {
  [WeatherSeverity.Unknown]: INK_UNKNOWN,
  [WeatherSeverity.Minor]: INK_MINOR,
  [WeatherSeverity.Moderate]: INK_MODERATE,
  [WeatherSeverity.Severe]: INK_SEVERE,
  [WeatherSeverity.Extreme]: INK_EXTREME,
};

export type SeverityMeta = Readonly<{
  label: string;
  ink: string;
}>;

export function parseWeatherSeverity(value: unknown): WeatherSeverity {
  return isEnumValue(value, WeatherSeverity) ? value : WeatherSeverity.Unknown;
}

export function weatherSeverityRank(severity: string | undefined): number {
  return SEVERITY_ORDER.indexOf(parseWeatherSeverity(severity));
}

export function weatherSeverityLabel(severity: string | undefined): string {
  return parseWeatherSeverity(severity).toUpperCase();
}

export function weatherSeverityInk(severity: string | undefined): string {
  return SEVERITY_INK[parseWeatherSeverity(severity)];
}

export function severityMeta(severity: string | undefined): SeverityMeta {
  return {
    label: weatherSeverityLabel(severity),
    ink: weatherSeverityInk(severity),
  };
}
