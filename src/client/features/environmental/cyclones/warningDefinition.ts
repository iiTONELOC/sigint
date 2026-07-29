import { Domain } from "@shared/domain/identity";
import { TriangleAlert } from "lucide-react";
import {
  STROKED_ICON_PROPS,
  type FeatureDefinition,
} from "@/features/base/types";
import { CycloneFeatureLabel, type CycloneWarningData } from "./types";
import { buildWarningDetailRows } from "./warningDetailRows";

export const cycloneWarningFeature: FeatureDefinition<
  CycloneWarningData,
  Record<string, never>,
  Domain.CyclonesWarning
> = {
  id: Domain.CyclonesWarning,
  label: CycloneFeatureLabel.TropicalAlert,
  icon: TriangleAlert,
  iconProps: STROKED_ICON_PROPS,
  TickerContent: () => null,
  buildDetailRows: (data) => buildWarningDetailRows(data),
};
