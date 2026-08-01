import { IntelSeverity } from "@shared/domain/correlation";
import { EMPTY_TEXT } from "@shared/text";
import {
  emptyFeatureFeedPresentation,
  FeatureTableAbbreviation,
  type FeatureFeedPresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";
import type { ShipData } from "../types";

export function shipTablePresentation(
  data: ShipData,
  id: string,
): FeatureTablePresentation {
  const speed = data.speed;
  return {
    abbreviation: FeatureTableAbbreviation.Ships,
    classification: data.vesselType ?? EMPTY_TEXT,
    classificationRank: 0,
    detail: speed == null ? EMPTY_TEXT : `${speed.toFixed(1)} kn`,
    detailRank: speed ?? 0,
    name: data.name || id,
  };
}

export function shipFeedPresentation(
  _data: ShipData,
  id: string,
): FeatureFeedPresentation {
  return emptyFeatureFeedPresentation(id, IntelSeverity.Monitoring);
}
