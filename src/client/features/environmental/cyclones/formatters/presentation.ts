import { IntelSeverity } from "@shared/domain/correlation";
import {
  emptyFeatureFeedPresentation,
  emptyFeatureTablePresentation,
  type FeatureFeedPresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";

/** Table rows name the storm, not its entity id. */
export function cycloneTablePresentation(
  name: string,
  type: string,
): FeatureTablePresentation {
  return emptyFeatureTablePresentation(name, type);
}

export function cycloneFeedPresentation(name: string): FeatureFeedPresentation {
  return emptyFeatureFeedPresentation(name, IntelSeverity.Monitoring);
}
