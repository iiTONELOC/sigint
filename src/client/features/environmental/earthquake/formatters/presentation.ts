import {
  IntelSeverity,
  intelSeverityBands,
} from "@shared/domain/correlation";
import type { EarthquakeData } from "@shared/domain/earthquakes";
import { EMPTY_TEXT } from "@shared/text";
import { bandValue } from "@shared/types/bands";
import {
  FeatureTableAbbreviation,
  type FeatureFeedPresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";

export enum EarthquakeCopy {
  Source = "USGS",
  UnknownLocation = "Unknown location",
}

/** Magnitude floors. */
const EARTHQUAKE_SEVERITY_BANDS = intelSeverityBands({
  crisis: 6,
  conflict: 5,
  tension: 4,
  concern: 3,
});

function formatEarthquakeDepth(depth: number): string {
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
