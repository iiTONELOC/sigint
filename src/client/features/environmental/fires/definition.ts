import { Domain } from "@shared/domain/identity";
import { Flame } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { FireData } from "./types";
import { buildFireDetailRows } from "./detailRows";
import { FireTickerContent } from "./ui/FireTickerContent";
import { fireDayNightSearchTerm } from "@/features/environmental/fires/data/uiQueries";
import { fireFeedPresentation, fireTablePresentation } from "./formatters";

export const firesFeature = defineFeature<FireData, Domain.Fires>({
  id: Domain.Fires,
  label: "FIRES",
  icon: Flame,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Fires,
  includeInRawFeed: true,

  buildDetailRows: (data: FireData, timestamp?: string) =>
    buildFireDetailRows(data, timestamp),
  tablePresentation: fireTablePresentation,
  feedPresentation: fireFeedPresentation,

  TickerContent: FireTickerContent,

  getSearchText: (data: FireData) =>
    [
      data.satellite,
      data.confidence,
      data.frp != null ? `FRP${data.frp}` : "",
      fireDayNightSearchTerm(data.daynight),
    ]
      .filter(Boolean)
      .join(" "),
});
