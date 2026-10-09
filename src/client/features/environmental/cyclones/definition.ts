import { Domain } from "@shared/domain/identity";
import { Wind } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import { CYCLONE_CATEGORY_METADATA, type CycloneData } from "@shared/domain/cyclones";
import { BLANK_SEPARATOR } from "@shared/text";
import { CycloneTickerContent } from "./ui/CycloneTickerContent";
import {
  cycloneFeedPresentation,
  cycloneTablePresentation,
} from "./formatters/presentation";

export const cycloneFeature = defineFeature<CycloneData, Domain.Cyclones>({
  id: Domain.Cyclones,
  label: "CYCLONES",
  icon: Wind,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Cyclones,
  DetailSummary: null,

  buildDetailRows: () => [],
  tablePresentation: (data) =>
    cycloneTablePresentation(data.name, Domain.Cyclones),
  feedPresentation: (data) => cycloneFeedPresentation(data.name),
  searchPresentation: (data) => ({
    primary: data.name,
    secondary: `${CYCLONE_CATEGORY_METADATA[data.classification].label}${BLANK_SEPARATOR}·${BLANK_SEPARATOR}${data.stormId}`,
  }),

  TickerContent: CycloneTickerContent,

  getSearchText: (data: CycloneData) =>
    [data.name, data.stormId, data.classification, data.basin]
      .filter(Boolean)
      .join(" "),
});
