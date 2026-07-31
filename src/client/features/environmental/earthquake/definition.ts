import { Domain } from "@shared/domain/identity";
import { Activity } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { EarthquakeData, EarthquakeFilter } from "./types";
import { buildEarthquakeDetailRows } from "./detailRows";
import { EarthquakeTickerContent } from "./ui/EarthquakeTickerContent";

export const earthquakeFeature: FeatureDefinition<
  EarthquakeData,
  EarthquakeFilter,
  Domain.Quakes
> = {
  id: Domain.Quakes,
  label: "SEISMIC",
  icon: Activity,
  iconProps: { strokeWidth: 2.5 },



  buildDetailRows: (data: EarthquakeData, timestamp?: string) =>
    buildEarthquakeDetailRows(data, timestamp),

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
};
