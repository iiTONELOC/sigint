import { IntelSeverity } from "@shared/domain/correlation";
import { EMPTY_TEXT } from "@shared/text";
import {
  emptyFeatureFeedPresentation,
  FeatureTableAbbreviation,
  type FeatureFeedPresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";
import type { AircraftData } from "../types";

export function aircraftTablePresentation(
  data: AircraftData,
  id: string,
): FeatureTablePresentation {
  const callsign = data.callsign?.trim() ?? EMPTY_TEXT;
  const altitude = data.altitude;
  return {
    abbreviation: FeatureTableAbbreviation.Aircraft,
    classification: data.acType ?? EMPTY_TEXT,
    classificationRank: 0,
    detail: altitude == null ? EMPTY_TEXT : `${altitude.toLocaleString()} ft`,
    detailRank: altitude ?? 0,
    name: callsign || data.icao24 || id,
  };
}

export function aircraftFeedPresentation(
  _data: AircraftData,
  id: string,
): FeatureFeedPresentation {
  return emptyFeatureFeedPresentation(id, IntelSeverity.Monitoring);
}
