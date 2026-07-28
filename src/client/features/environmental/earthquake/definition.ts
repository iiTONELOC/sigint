import { Activity } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { EarthquakeData, EarthquakeFilter } from "./types";
import { buildEarthquakeDetailRows } from "./detailRows";
import { EarthquakeTickerContent } from "./ui/EarthquakeTickerContent";
import { EARTHQUAKE_UI_QUERIES } from "@/features/environmental/earthquake/data/uiQueries";

export const earthquakeFeature: FeatureDefinition<
  EarthquakeData,
  EarthquakeFilter,
  "quakes"
> = {
  id: "quakes",
  label: "SEISMIC",
  icon: Activity,
  iconProps: { strokeWidth: 2.5 },

  matchesFilter: (item, filter) =>
    EARTHQUAKE_UI_QUERIES.descriptor.matchesFilter(item, filter),

  defaultFilter: { enabled: true, minMagnitude: 0 },

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
