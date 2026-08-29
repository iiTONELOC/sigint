import { NO_VALUE } from "@shared/text";
import { FireConfidenceCode } from "@shared/domain/fireDayNight";

export enum FrpBandId {
  Extreme = 500,
  VeryHigh = 100,
  High = 50,
  Moderate = 10,
  Low = 0,
}

export enum FireTemperatureThreshold {
  DetectionDeltaKelvin = 15,
}

export enum FireIntensityLabel {
  High = "HIGH",
  Low = "LOW",
}

export enum FireAnomalyStrength {
  Strong = "strong",
  Weak = "weak",
}

export enum FireConfidenceBand {
  Unknown = -1,
  Low = 0,
  Nominal = 1,
  High = 2,
}

enum FireConfidenceThreshold {
  Nominal = 30,
  High = 80,
  NumericRadix = 10,
}

export type FrpBand = Readonly<{
  id: FrpBandId;
  min: number;
  label: string;
  className: string;
}>;

export type ConfidenceMeta = Readonly<{
  level: FireConfidenceBand;
  label: string;
  meaning: string;
}>;

type FrpBandMetadata = Omit<FrpBand, "id" | "min">;
type ConfidenceMetadata = Omit<ConfidenceMeta, "level">;

const FRP_BAND_METADATA: Readonly<Record<FrpBandId, FrpBandMetadata>> = {
  [FrpBandId.Extreme]: {
    label: "EXTREME",
    className: "[--dossier-accent:#d97706] [--intensity-color:#fde047]",
  },
  [FrpBandId.VeryHigh]: {
    label: "VERY HIGH",
    className: "[--dossier-accent:#ea580c] [--intensity-color:#fb923c]",
  },
  [FrpBandId.High]: {
    label: FireIntensityLabel.High,
    className: "[--dossier-accent:#e25406] [--intensity-color:#f97316]",
  },
  [FrpBandId.Moderate]: {
    label: "MODERATE",
    className: "[--dossier-accent:#c2410c] [--intensity-color:#ea580c]",
  },
  [FrpBandId.Low]: {
    label: FireIntensityLabel.Low,
    className: "[--dossier-accent:#9a3412] [--intensity-color:#9a3412]",
  },
};

const CONFIDENCE_METADATA: Readonly<
  Record<FireConfidenceBand, ConfidenceMetadata>
> = {
  [FireConfidenceBand.Unknown]: { label: NO_VALUE, meaning: "unrated" },
  [FireConfidenceBand.Low]: {
    label: FireIntensityLabel.Low,
    meaning: "weak or sun-glint",
  },
  [FireConfidenceBand.Nominal]: {
    label: "NOMINAL",
    meaning: "clean, strong signal",
  },
  [FireConfidenceBand.High]: {
    label: FireIntensityLabel.High,
    meaning: "saturated pixel",
  },
};

function frpBandDefinition(id: FrpBandId): FrpBand {
  return { id, min: id, ...FRP_BAND_METADATA[id] };
}

function confidenceDefinition(id: FireConfidenceBand): ConfidenceMeta {
  return { level: id, ...CONFIDENCE_METADATA[id] };
}

export function frpScale(): readonly FrpBand[] {
  return Object.values(FrpBandId)
    .filter((value): value is FrpBandId => typeof value === "number")
    .sort((left, right) => right - left)
    .map(frpBandDefinition);
}

export function frpBand(frp: number): FrpBand {
  return frpScale().find((band) => frp >= band.min) ??
    frpBandDefinition(FrpBandId.Low);
}

function confidenceBand(value: string): FireConfidenceBand {
  const numeric = Number.parseInt(value, FireConfidenceThreshold.NumericRadix);
  if (Number.isFinite(numeric) && /^\d+$/.test(value)) {
    if (numeric >= FireConfidenceThreshold.High) {
      return FireConfidenceBand.High;
    }
    if (numeric >= FireConfidenceThreshold.Nominal) {
      return FireConfidenceBand.Nominal;
    }
    return FireConfidenceBand.Low;
  }
  if (
    value === FireConfidenceCode.High ||
    value === FireConfidenceCode.HighShort
  ) {
    return FireConfidenceBand.High;
  }
  if (
    value === FireConfidenceCode.Nominal ||
    value === FireConfidenceCode.NominalShort
  ) {
    return FireConfidenceBand.Nominal;
  }
  if (
    value === FireConfidenceCode.Low ||
    value === FireConfidenceCode.LowShort
  ) {
    return FireConfidenceBand.Low;
  }
  return FireConfidenceBand.Unknown;
}

export function confidenceMeta(confidence?: string): ConfidenceMeta {
  if (!confidence) return confidenceDefinition(FireConfidenceBand.Unknown);
  return confidenceDefinition(
    confidenceBand(confidence.trim().toLowerCase()),
  );
}

export function fireAnomalyStrength(
  deltaKelvin: number,
): FireAnomalyStrength {
  return deltaKelvin >= FireTemperatureThreshold.DetectionDeltaKelvin
    ? FireAnomalyStrength.Strong
    : FireAnomalyStrength.Weak;
}
