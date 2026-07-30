import { Activity } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { EarthquakeData, EarthquakeFilter } from "./types";
import type { BasePoint } from "@/features/base/types";
import { buildEarthquakeDetailRows } from "./detailRows";
import { EarthquakeTickerContent } from "./ui/EarthquakeTickerContent";

export const earthquakeFeature: FeatureDefinition<
  EarthquakeData,
  EarthquakeFilter
> = {
  id: "quakes",
  label: "SEISMIC",
  icon: Activity,
  iconProps: { strokeWidth: 2.5 },

  matchesFilter: (
    _item: BasePoint & { data: EarthquakeData },
    filter: EarthquakeFilter,
  ) => {
    if (!filter.enabled) return false;
    const mag = _item.data?.magnitude;
    if (mag != null && filter.minMagnitude > 0 && mag < filter.minMagnitude) {
      return false;
    }
    return true;
  },

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
