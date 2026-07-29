import { Domain } from "@shared/domain/identity";
import { Flame } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { FireData, FireFilter } from "./types";
import { buildFireDetailRows } from "./detailRows";
import { FireTickerContent } from "./ui/FireTickerContent";
import { fireDayNightSearchTerm } from "@/features/environmental/fires/data/uiQueries";

export const firesFeature: FeatureDefinition<FireData, FireFilter, Domain.Fires> = {
  id: Domain.Fires,
  label: "FIRES",
  icon: Flame,
  iconProps: { strokeWidth: 2.5 },



  buildDetailRows: (data: FireData, timestamp?: string) =>
    buildFireDetailRows(data, timestamp),

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
};
