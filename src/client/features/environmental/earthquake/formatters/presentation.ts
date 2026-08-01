import { IntelSeverity } from "@shared/domain/correlation";
import { EMPTY_TEXT } from "@shared/text";
import { bandValue, type Band } from "@shared/types/bands";
import {
  FeatureTableAbbreviation,
  type FeatureFeedPresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";
import type { EarthquakeData } from "../types";

export enum EarthquakeCopy {
  Source = "USGS",
  UnknownLocation = "Unknown location",
}

enum EarthquakeSeverityThreshold {
  CrisisMinimum = 6,
  ConflictMinimum = 5,
  TensionMinimum = 4,
  ConcernMinimum = 3,
}

const EARTHQUAKE_SEVERITY_BANDS: readonly Band<IntelSeverity>[] = [
  {
    floor: EarthquakeSeverityThreshold.CrisisMinimum,
    value: IntelSeverity.Crisis,
  },
  {
    floor: EarthquakeSeverityThreshold.ConflictMinimum,
    value: IntelSeverity.Conflict,
  },
  {
    floor: EarthquakeSeverityThreshold.TensionMinimum,
    value: IntelSeverity.Tension,
  },
  {
    floor: EarthquakeSeverityThreshold.ConcernMinimum,
    value: IntelSeverity.Concern,
  },
];

export function formatEarthquakeDepth(depth: number): string {
  return `${depth.toFixed(1)} km`;
}

export function earthquakeTablePresentation(
  data: EarthquakeData,
  id: string,
): FeatureTablePresentation {
  const magnitude = data.magnitude;
  const depth = data.depth;
  return {
    abbreviation: FeatureTableAbbreviation.Quakes,
    classification: magnitude == null ? EMPTY_TEXT : `M${magnitude}`,
    classificationRank: magnitude ?? 0,
    detail: depth == null ? EMPTY_TEXT : formatEarthquakeDepth(depth),
    detailRank: depth ?? 0,
    name: data.location || id,
  };
}

export function earthquakeFeedPresentation(
  data: EarthquakeData,
  _id: string,
): FeatureFeedPresentation {
  const magnitude = data.magnitude ?? 0;
  return {
    category: `M${magnitude.toFixed(1)}`,
    headline: data.location || EarthquakeCopy.UnknownLocation,
    location: EMPTY_TEXT,
    severity: bandValue(
      magnitude,
      EARTHQUAKE_SEVERITY_BANDS,
      IntelSeverity.Monitoring,
    ),
    source: EarthquakeCopy.Source,
    url: data.url || null,
  };
}
