import { Domain } from "@shared/domain/identity";
import { Wind } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { CycloneData, CycloneFilter } from "./types";
import { buildCycloneDetailRows } from "./detailRows";
import { CycloneTickerContent } from "./ui/CycloneTickerContent";

export const cycloneFeature: FeatureDefinition<CycloneData, CycloneFilter, Domain.Cyclones> = {
  id: Domain.Cyclones,
  label: "CYCLONES",
  icon: Wind,
  iconProps: { strokeWidth: 2.5 },



  buildDetailRows: (data: CycloneData, timestamp?: string) =>
    buildCycloneDetailRows(data, timestamp),

  TickerContent: CycloneTickerContent,

  getSearchText: (data: CycloneData) =>
    [data.name, data.stormId, data.classification, data.basin]
      .filter(Boolean)
      .join(" "),
};
