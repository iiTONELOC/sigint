import { Flame } from "lucide-react";
import type { FeatureDefinition, BasePoint } from "@/features/base/types";
import type { FireData, FireFilter } from "./types";
import { fireConfidenceLevel } from "./data/source";
import { buildFireDetailRows } from "./detailRows";
import { FireTickerContent } from "./ui/FireTickerContent";

export const firesFeature: FeatureDefinition<FireData, FireFilter> = {
  id: "fires",
  label: "FIRES",
  icon: Flame,
  iconProps: { strokeWidth: 2.5 },

  matchesFilter: (
    _item: BasePoint & { data: FireData },
    filter: FireFilter,
  ) => {
    if (!filter.enabled) return false;
    if (filter.minConfidence > 0) {
      const level = fireConfidenceLevel(_item.data?.confidence);
      if (level < filter.minConfidence) return false;
    }
    return true;
  },

  defaultFilter: { enabled: true, minConfidence: 0 },

  buildDetailRows: (data: FireData, timestamp?: string) =>
    buildFireDetailRows(data, timestamp),

  TickerContent: FireTickerContent,

  getSearchText: (data: FireData) =>
    [
      data.satellite,
      data.confidence,
      data.frp != null ? `FRP${data.frp}` : "",
      data.daynight === "D" ? "day" : data.daynight === "N" ? "night" : "",
    ]
      .filter(Boolean)
      .join(" "),
};
