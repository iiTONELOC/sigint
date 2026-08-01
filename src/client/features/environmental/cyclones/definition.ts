import { Domain } from "@shared/domain/identity";
import { Wind } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { CycloneData } from "./types";
import { buildCycloneDetailRows } from "./detailRows";
import { CycloneTickerContent } from "./ui/CycloneTickerContent";
import {
  cycloneFeedPresentation,
  cycloneTablePresentation,
} from "./formatters";

export const cycloneFeature = defineFeature<CycloneData, Domain.Cyclones>({
  id: Domain.Cyclones,
  label: "CYCLONES",
  icon: Wind,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Cyclones,

  buildDetailRows: (data: CycloneData, timestamp?: string) =>
    buildCycloneDetailRows(data, timestamp),
  tablePresentation: (_data, id) =>
    cycloneTablePresentation(id, Domain.Cyclones),
  feedPresentation: (_data, id) => cycloneFeedPresentation(id),

  TickerContent: CycloneTickerContent,

  getSearchText: (data: CycloneData) =>
    [data.name, data.stormId, data.classification, data.basin]
      .filter(Boolean)
      .join(" "),
});
