import { isEnumValue } from "@shared/types/enum";

export enum WeatherSeverity {
  Unknown = "Unknown",
  Minor = "Minor",
  Moderate = "Moderate",
  Severe = "Severe",
  Extreme = "Extreme",
}

export enum WeatherInk {
  Slate = "#6b7a8d",
  Blue = "#5c7cfa",
  Violet = "#9775fa",
  Magenta = "#cc5de8",
  Pink = "#e64980",
}

const SEVERITY_ORDER: readonly WeatherSeverity[] =
  Object.values(WeatherSeverity);

const SEVERITY_INK: Readonly<Record<WeatherSeverity, string>> = {
  [WeatherSeverity.Unknown]: WeatherInk.Slate,
  [WeatherSeverity.Minor]: WeatherInk.Blue,
  [WeatherSeverity.Moderate]: WeatherInk.Violet,
  [WeatherSeverity.Severe]: WeatherInk.Magenta,
  [WeatherSeverity.Extreme]: WeatherInk.Pink,
};

export function parseWeatherSeverity(value: unknown): WeatherSeverity {
  return isEnumValue(value, WeatherSeverity) ? value : WeatherSeverity.Unknown;
}

export function weatherSeverityRank(severity: WeatherSeverity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

export function weatherSeverityFromRank(rank: number): WeatherSeverity {
  return SEVERITY_ORDER[rank] ?? WeatherSeverity.Unknown;
}

export function weatherSeverityLabel(severity: WeatherSeverity): string {
  return severity.toUpperCase();
}

export function weatherSeverityInk(severity: WeatherSeverity): string {
  return SEVERITY_INK[severity];
}
