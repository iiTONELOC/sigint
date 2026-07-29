import {
  type MarkerGlow,
  type MarkerPulse,
  type MarkerStyle,
} from "@/workers/render/primitives/markerStyle";
import { AreaKind } from "@/workers/render/protocol";
import {
  WeatherSeverity,
  weatherSeverityInk,
  weatherSeverityRank,
} from "./severity";

const MARKER: Readonly<Record<WeatherSeverity, MarkerStyle>> = {
  [WeatherSeverity.Unknown]: { size: 1.5, alpha: 0.6 },
  [WeatherSeverity.Minor]: { size: 2, alpha: 0.6 },
  [WeatherSeverity.Moderate]: { size: 3, alpha: 0.75 },
  [WeatherSeverity.Severe]: { size: 4.5, alpha: 0.9 },
  [WeatherSeverity.Extreme]: { size: 6, alpha: 1 },
};

const GLOW: MarkerGlow = {
  idSliceFrom: 2,
  rate: 0.5,
  baseAmp: 0.1,
  ampGain: 0.2,
  radBase: 1.8,
  radGain: 1.5,
  alphaHex: "30",
  glowMul: 0.4,
};

const WARNING_MIN_RANK = weatherSeverityRank(WeatherSeverity.Severe);
const PULSE_FLOOR_RANK = weatherSeverityRank(WeatherSeverity.Moderate);
const PULSE_CEILING_RANK = weatherSeverityRank(WeatherSeverity.Extreme);
const PULSE_RANK_SPAN = PULSE_CEILING_RANK - PULSE_FLOOR_RANK;
const MAX_PULSE_INDEX = 1;

export const WEATHER_AREA_FILL: Readonly<Record<AreaKind, string>> = {
  [AreaKind.Warning]: weatherSeverityInk(WeatherSeverity.Extreme),
  [AreaKind.Watch]: weatherSeverityInk(WeatherSeverity.Moderate),
};

export function weatherIsWarning(severity: WeatherSeverity): boolean {
  return weatherSeverityRank(severity) >= WARNING_MIN_RANK;
}

export function weatherAreaKind(severity: WeatherSeverity): AreaKind {
  return weatherIsWarning(severity) ? AreaKind.Warning : AreaKind.Watch;
}

export function weatherMarker(severity: WeatherSeverity): MarkerStyle {
  return MARKER[severity];
}

export function weatherPulse(severity: WeatherSeverity): MarkerPulse | null {
  if (!weatherIsWarning(severity)) return null;
  const rank = weatherSeverityRank(severity);
  return {
    glow: GLOW,
    index: Math.min(
      MAX_PULSE_INDEX,
      (rank - PULSE_FLOOR_RANK) / PULSE_RANK_SPAN,
    ),
  };
}
