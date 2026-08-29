import { Domain } from "@shared/domain/identity";
import { TriangleAlert } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { CycloneWarningData } from "@shared/domain/cyclones";
import { buildWarningDetailRows } from "./warningDetailRows";
import {
  cycloneFeedPresentation,
  cycloneTablePresentation,
} from "./formatters/presentation";

export const cycloneWarningFeature = defineFeature<
  CycloneWarningData,
  Domain.CyclonesWarning
>({
  id: Domain.CyclonesWarning,
  label: "TROPICAL ALERT",
  icon: TriangleAlert,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Cyclones,
  includeInDataTable: false,
  TickerContent: () => null,
  buildDetailRows: (data) => buildWarningDetailRows(data),
  tablePresentation: (_data, id) =>
    cycloneTablePresentation(id, Domain.CyclonesWarning),
  feedPresentation: (_data, id) => cycloneFeedPresentation(id),
});
