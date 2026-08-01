import { IntelSeverity } from "@shared/domain/correlation";
import {
  emptyFeatureFeedPresentation,
  emptyFeatureTablePresentation,
  type FeatureFeedPresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";

export function cycloneTablePresentation(
  id: string,
  type: string,
): FeatureTablePresentation {
  return emptyFeatureTablePresentation(id, type);
}

export function cycloneFeedPresentation(id: string): FeatureFeedPresentation {
  return emptyFeatureFeedPresentation(id, IntelSeverity.Monitoring);
}
