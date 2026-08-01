import { IntelSeverity } from "@shared/domain/correlation";
import { EMPTY_TEXT } from "@shared/text";
import { bandValue, type Band } from "@shared/types/bands";
import {
  FeatureTableAbbreviation,
  type FeatureFeedPresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";
import type { FireData } from "../types";

export enum FireCopy {
  DefaultSatellite = "VIIRS",
  Hotspot = "Fire hotspot",
  RadiativePower = "FRP",
}

enum FireUnit {
  Kelvin = "K",
  Megawatt = "MW",
}

enum FireSeverityThreshold {
  CrisisMinimum = 100,
  ConflictMinimum = 50,
  TensionMinimum = 20,
  ConcernMinimum = 5,
}

const FIRE_SEVERITY_BANDS: readonly Band<IntelSeverity>[] = [
  {
    floor: FireSeverityThreshold.CrisisMinimum,
    value: IntelSeverity.Crisis,
  },
  {
    floor: FireSeverityThreshold.ConflictMinimum,
    value: IntelSeverity.Conflict,
  },
  {
    floor: FireSeverityThreshold.TensionMinimum,
    value: IntelSeverity.Tension,
  },
  {
    floor: FireSeverityThreshold.ConcernMinimum,
    value: IntelSeverity.Concern,
  },
];

export function formatFirePower(power: number): string {
  return `${power.toFixed(1)} ${FireUnit.Megawatt}`;
}

export function formatUnroundedFirePower(power: number): string {
  return `${power} ${FireUnit.Megawatt}`;
}

export function formatFireTemperature(temperature: number): string {
  return `${temperature.toFixed(1)} ${FireUnit.Kelvin}`;
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
