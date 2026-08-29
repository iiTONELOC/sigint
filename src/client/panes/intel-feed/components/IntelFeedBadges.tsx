import type { IntelSeverity } from "@shared/domain/correlation";
import { INTEL_SEVERITY_PRESENTATION, IntelFeedCopy, intelPriorityClassName } from "../model/feed";

export function IntelPriorityBadge({
  priority,
}: {
  readonly priority: number;
}) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-(length:--sig-text-sm) font-bold tracking-wider border shrink-0 ${intelPriorityClassName(priority)}`}
    >
      {IntelFeedCopy.PriorityPrefix}
      {priority}
    </span>
  );
}

export function IntelSeverityBadge({
  severity,
}: {
  readonly severity: IntelSeverity;
}) {
  const presentation = INTEL_SEVERITY_PRESENTATION[severity];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-(length:--sig-text-sm) font-semibold tracking-wider border shrink-0 ${presentation.className}`}
    >
      {presentation.label}
    </span>
  );
}
