import { IntelSeverity } from "@shared/domain/correlation";
import { EMPTY_TEXT } from "@shared/text";
import {
  FeatureTableAbbreviation,
  type FeatureFeedPresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";
import type { EventData } from "@shared/domain/events";
import { EventCopy } from "./copy";

export function eventTablePresentation(
  data: EventData,
  id: string,
): FeatureTablePresentation {
  return {
    abbreviation: FeatureTableAbbreviation.Events,
    classification: data.category ?? EMPTY_TEXT,
    classificationRank: data.severity ?? 0,
    detail: data.source ?? EMPTY_TEXT,
    detailRank: 0,
    name: data.headline || id,
  };
}

export function eventFeedPresentation(
  data: EventData,
  _id: string,
): FeatureFeedPresentation {
  return {
    category: data.category ?? EMPTY_TEXT,
    headline: data.headline || EventCopy.UnknownTitle,
    location: data.locationName ?? EMPTY_TEXT,
    severity: data.severity ?? IntelSeverity.Monitoring,
    source: data.source ?? EMPTY_TEXT,
    url: data.url || null,
  };
}
