import { Domain } from "@shared/domain/identity";
import { Activity } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { EarthquakeData } from "./types";
import { buildEarthquakeDetailRows } from "./detailRows";
import { EarthquakeTickerContent } from "./ui/EarthquakeTickerContent";
import {
  earthquakeFeedPresentation,
  earthquakeTablePresentation,
} from "./formatters";

export const earthquakeFeature = defineFeature<
  EarthquakeData,
  Domain.Quakes
>({
  id: Domain.Quakes,
  label: "SEISMIC",
  icon: Activity,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Quakes,
  includeInRawFeed: true,

  buildDetailRows: (data: EarthquakeData, timestamp?: string) =>
    buildEarthquakeDetailRows(data, timestamp),
  tablePresentation: earthquakeTablePresentation,
  feedPresentation: earthquakeFeedPresentation,

  TickerContent: EarthquakeTickerContent,

  getSearchText: (data: EarthquakeData) =>
    [
      data.location,
      data.magnitude != null ? `M${data.magnitude}` : "",
      data.alert,
      data.eventType,
    ]
      .filter(Boolean)
      .join(" "),
});
