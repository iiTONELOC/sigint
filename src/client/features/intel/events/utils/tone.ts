import { bandValue, type Band } from "@shared/types/bands";

enum EventToneThreshold {
  CrisisMaximum = -15,
  ConflictMaximum = -10,
  NegativeMaximum = -5,
  ConcernMaximum = -1,
  NeutralMaximum = 1,
  SlightPositiveMaximum = 5,
}

enum EventAssessmentLabel {
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

const TONE_BANDS: readonly Band<EventAssessmentLabel>[] = [
  {
    floor: -EventToneThreshold.CrisisMaximum,
    value: EventAssessmentLabel.VeryNegative,
  },
  {
    floor: -EventToneThreshold.ConflictMaximum,
    value: EventAssessmentLabel.Negative,
  },
  {
    floor: -EventToneThreshold.NegativeMaximum,
    value: EventAssessmentLabel.Negative,
  },
  {
    floor: -EventToneThreshold.ConcernMaximum,
    value: EventAssessmentLabel.SlightlyNegative,
  },
  {
    floor: -EventToneThreshold.NeutralMaximum,
    value: EventAssessmentLabel.Neutral,
  },
  {
    floor: -EventToneThreshold.SlightPositiveMaximum,
    value: EventAssessmentLabel.SlightlyPositive,
  },
];

function toneBand(tone: number): EventAssessmentLabel {
  return bandValue(-tone, TONE_BANDS, EventAssessmentLabel.Positive);
}

export function eventToneLabel(tone: number): EventAssessmentLabel {
  return toneBand(tone);
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
