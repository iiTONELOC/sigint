import { Wind } from "lucide-react";
import type { FeatureDefinition, BasePoint } from "@/features/base/types";
import type { CycloneData, CycloneFilter } from "./types";
import { buildCycloneDetailRows } from "./detailRows";
import { CycloneTickerContent } from "./ui/CycloneTickerContent";

export const cycloneFeature: FeatureDefinition<CycloneData, CycloneFilter> = {
  id: "cyclones",
  label: "CYCLONES",
  icon: Wind,
  iconProps: { strokeWidth: 2.5 },

  matchesFilter: (
    item: BasePoint & { data: CycloneData },
    filter: CycloneFilter,
  ) => {
    if (!filter.enabled) return false;
    if (filter.minCategory > 0 && item.data.saffirSimpson < filter.minCategory) {
      return false;
    }
    return true;
  },

  defaultFilter: {
    enabled: true,
    minCategory: 0,
    showForecast: true,
    showCone: true,
  },

  buildDetailRows: (data: CycloneData, timestamp?: string) =>
    buildCycloneDetailRows(data, timestamp),

  TickerContent: CycloneTickerContent,

  getSearchText: (data: CycloneData) =>
    [data.name, data.stormId, data.classification, data.basin]
      .filter(Boolean)
      .join(" "),
};
