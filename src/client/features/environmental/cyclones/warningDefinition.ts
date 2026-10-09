import { Domain } from "@shared/domain/identity";
import { TriangleAlert } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { CycloneWarningData } from "@shared/domain/cyclones";
import { WeatherDetailSummary } from "@/features/environmental/weather/ui/WeatherDetailSummary";
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
  DetailSummary: WeatherDetailSummary,
  buildDetailRows: () => [],
  tablePresentation: (data, id) =>
    cycloneTablePresentation(data.event ?? id, Domain.CyclonesWarning),
  feedPresentation: (data, id) => cycloneFeedPresentation(data.event ?? id),
});
