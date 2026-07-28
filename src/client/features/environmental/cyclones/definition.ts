import { Wind } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { CycloneData, CycloneFilter } from "./types";
import { buildCycloneDetailRows } from "./detailRows";
import { CycloneTickerContent } from "./ui/CycloneTickerContent";
import { CYCLONE_UI_QUERIES } from "@/features/environmental/cyclones/data/uiQueries";

export const cycloneFeature: FeatureDefinition<CycloneData, CycloneFilter, "cyclones"> = {
  id: "cyclones",
  label: "CYCLONES",
  icon: Wind,
  iconProps: { strokeWidth: 2.5 },

  matchesFilter: (item, filter) =>
    CYCLONE_UI_QUERIES.descriptor.matchesFilter(item, filter),

  defaultFilter: {
    enabled: true,
    minCategory: 0,
    showForecast: true,
    showCone: true,
    showWindField: false,
    showModels: false,
    showWarnings: true,
  },

  buildDetailRows: (data: CycloneData, timestamp?: string) =>
    buildCycloneDetailRows(data, timestamp),

  TickerContent: CycloneTickerContent,

  getSearchText: (data: CycloneData) =>
    [data.name, data.stormId, data.classification, data.basin]
      .filter(Boolean)
      .join(" "),
};
