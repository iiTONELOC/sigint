import { Flame } from "lucide-react";
import type { FeatureDefinition, BasePoint } from "@/features/base/types";
import type { FireData, FireFilter } from "./types";
import { buildFireDetailRows } from "./detailRows";
import { FireTickerContent } from "./ui/FireTickerContent";

function confidenceLevel(conf?: string): number {
  if (!conf) return 0;
  const c = conf.toLowerCase();
  if (c === "high" || c === "h") return 2;
  if (c === "nominal" || c === "n") return 1;
  return 0; // low
}

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
      const level = confidenceLevel(_item.data?.confidence);
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
