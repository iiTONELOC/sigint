import { IntelSeverity } from "@shared/domain/correlation";
import { upperBoundValue, type UpperBoundBand } from "./ramp";

export enum EventToneThreshold {
  CrisisMaximum = -15,
  ConflictMaximum = -10,
  NegativeMaximum = -5,
  ConcernMaximum = -1,
  NeutralMaximum = 1,
  SlightPositiveMaximum = 5,
}

export enum EventAssessmentLabel {
  VeryNegative = "very negative",
  Negative = "negative",
  SlightlyNegative = "slightly negative",
  Neutral = "neutral",
  SlightlyPositive = "slightly positive",
  Positive = "positive",
  MajorConflict = "major conflict",
  Conflict = "conflict",
  Cooperation = "cooperation",
  MajorCooperation = "major cooperation",
}

enum EventImpactThreshold {
  ConflictMaximum = -5,
  Zero = 0,
  CooperationMaximum = 5,
}

type EventToneBand = Readonly<{
  label: EventAssessmentLabel;
  severity: IntelSeverity;
}>;

const TONE_BANDS: readonly UpperBoundBand<EventToneBand>[] = [
  {
    max: EventToneThreshold.CrisisMaximum,
    value: {
      label: EventAssessmentLabel.VeryNegative,
      severity: IntelSeverity.Crisis,
    },
  },
  {
    max: EventToneThreshold.ConflictMaximum,
    value: {
      label: EventAssessmentLabel.Negative,
      severity: IntelSeverity.Conflict,
    },
  },
  {
    max: EventToneThreshold.NegativeMaximum,
    value: {
      label: EventAssessmentLabel.Negative,
      severity: IntelSeverity.Tension,
    },
  },
  {
    max: EventToneThreshold.ConcernMaximum,
    value: {
      label: EventAssessmentLabel.SlightlyNegative,
      severity: IntelSeverity.Concern,
    },
  },
  {
    max: EventToneThreshold.NeutralMaximum,
    value: {
      label: EventAssessmentLabel.Neutral,
      severity: IntelSeverity.Monitoring,
    },
  },
  {
    max: EventToneThreshold.SlightPositiveMaximum,
    value: {
      label: EventAssessmentLabel.SlightlyPositive,
      severity: IntelSeverity.Monitoring,
    },
  },
];

const TONE_FALLBACK: EventToneBand = {
  label: EventAssessmentLabel.Positive,
  severity: IntelSeverity.Monitoring,
};

export type EventToneClassification = Readonly<{
  category: string;
  severity: IntelSeverity;
}>;

export function classifyEventTone(tone: number): EventToneClassification {
  const { severity } = upperBoundValue(tone, TONE_BANDS, TONE_FALLBACK);
  return { category: IntelSeverity[severity], severity };
}

export function eventToneLabel(tone: number): EventAssessmentLabel {
  return upperBoundValue(tone, TONE_BANDS, TONE_FALLBACK).label;
}

export function eventImpactLabel(score: number): EventAssessmentLabel {
  if (score <= EventImpactThreshold.ConflictMaximum) {
    return EventAssessmentLabel.MajorConflict;
  }
  if (score < EventImpactThreshold.Zero) {
    return EventAssessmentLabel.Conflict;
  }
  if (score === EventImpactThreshold.Zero) {
    return EventAssessmentLabel.Neutral;
  }
  if (score <= EventImpactThreshold.CooperationMaximum) {
    return EventAssessmentLabel.Cooperation;
  }
  return EventAssessmentLabel.MajorCooperation;
}
