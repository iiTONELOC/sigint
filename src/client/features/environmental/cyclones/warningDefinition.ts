import { Domain } from "@shared/domain/identity";
import { TriangleAlert } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import { CycloneFeatureLabel, type CycloneWarningData } from "./types";
import { buildWarningDetailRows } from "./warningDetailRows";
import {
  cycloneFeedPresentation,
  cycloneTablePresentation,
} from "./formatters";

export const cycloneWarningFeature = defineFeature<
  CycloneWarningData,
  Domain.CyclonesWarning
>({
  id: Domain.CyclonesWarning,
  label: CycloneFeatureLabel.TropicalAlert,
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
