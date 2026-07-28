import { Domain } from "@shared/domain/identity";
import { TriangleAlert } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { CycloneWarning } from "./data/warnings";
import { buildWarningDetailRows } from "./data/warningPoint";

// Synthetic feature so a clicked watch/warning polygon resolves through the
// detail pipeline (featureRegistry.get(type) → buildDetailRows). It is NOT a
// data layer: no Domain.CyclonesWarning points live in allData, so the ticker /
// filter / count hooks never iterate it. Selection comes from a click hit-test
// against the polygon geometry (see inputHandlers.ts).
export const cycloneWarningFeature: FeatureDefinition<
  CycloneWarning,
  Record<string, never>,
  Domain.CyclonesWarning
> = {
  id: Domain.CyclonesWarning,
  label: "TROPICAL ALERT",
  icon: TriangleAlert,
  iconProps: { strokeWidth: 2.5 },
  TickerContent: () => null,
  matchesFilter: () => true,
  defaultFilter: {},
  buildDetailRows: (data) => buildWarningDetailRows(data),
};
