import {
  IntelSeverity,
  intelSeverityBands,
} from "@shared/domain/correlation";
import { EMPTY_TEXT, joinSearchText } from "@shared/text";
import { bandValue } from "@shared/types/bands";
import {
  FeatureTableAbbreviation,
  type FeatureFeedPresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";
import {
  FireDayNight,
  type FireData,
} from "@shared/domain/fireDayNight";
import { stringEnumMemberName } from "@shared/types/enum";

export enum FireCopy {
  DefaultSatellite = "VIIRS",
  Hotspot = "Fire hotspot",
  RadiativePower = "FRP",
}

export enum FirePassLabel {
  Day = "day",
  DayUppercase = "DAY",
  Night = "night",
  NightUppercase = "NIGHT",
}

enum FireUnit {
  Kelvin = "K",
  Megawatt = "MW",
}

/** Radiative power floors in megawatts. */
const FIRE_SEVERITY_BANDS = intelSeverityBands({
  crisis: 100,
  conflict: 50,
  tension: 20,
  concern: 5,
});

export function formatFirePower(power: number): string {
  return `${power.toFixed(1)} ${FireUnit.Megawatt}`;
}

export function formatUnroundedFirePower(power: number): string {
  return `${power} ${FireUnit.Megawatt}`;
}

export function formatFireTemperature(temperature: number): string {
  return `${temperature.toFixed(1)} ${FireUnit.Kelvin}`;
}

function fireDayNightSearchTerm(value: string | undefined): string {
  return stringEnumMemberName(value, FireDayNight)?.toLowerCase() ?? "";
}

export function fireSearchText(data: FireData): string {
  return joinSearchText([
    data.satellite,
    data.confidence,
    data.frp == null ? "" : `${FireCopy.RadiativePower}${data.frp}`,
    fireDayNightSearchTerm(data.daynight),
  ]);
}

export function fireQuerySearchText(data: FireData): string {
  return joinSearchText([
    data.confidence,
    data.satellite,
    data.frp == null ? "" : `${FireCopy.RadiativePower}${data.frp}`,
    fireDayNightSearchTerm(data.daynight),
  ]);
}

export function fireQueryTableName(data: FireData): string {
  return data.frp === undefined
    ? FireCopy.Hotspot
    : `${FireCopy.RadiativePower} ${formatFirePower(data.frp)}`;
}

export function fireTablePresentation(
  data: FireData,
  _id: string,
): FeatureTablePresentation {
  const power = data.frp;
  const temperature = data.brightness;
  return {
    abbreviation: FeatureTableAbbreviation.Fires,
    classification: data.confidence?.toUpperCase() ?? EMPTY_TEXT,
    classificationRank: power ?? 0,
    detail:
      temperature == null ? EMPTY_TEXT : formatFireTemperature(temperature),
    detailRank: temperature ?? 0,
    name: power
      ? `${FireCopy.RadiativePower} ${formatFirePower(power)}`
      : FireCopy.Hotspot,
  };
}

export function fireFeedPresentation(
  data: FireData,
  _id: string,
): FeatureFeedPresentation {
  const power = data.frp;
  return {
    category: data.confidence?.toUpperCase() ?? EMPTY_TEXT,
    headline:
      power == null
        ? FireCopy.Hotspot
        : `${FireCopy.Hotspot}, ${FireCopy.RadiativePower} ${formatFirePower(power)}`,
    location: EMPTY_TEXT,
    severity: bandValue(
      power ?? 0,
      FIRE_SEVERITY_BANDS,
      IntelSeverity.Monitoring,
    ),
    source: data.satellite || FireCopy.DefaultSatellite,
    url: null,
  };
}
