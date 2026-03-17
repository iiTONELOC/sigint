import { CloudAlert } from "lucide-react";
import type { FeatureDefinition, BasePoint } from "@/features/base/types";
import type { WeatherData, WeatherFilter } from "./types";
import { buildWeatherDetailRows } from "./detailRows";
import { WeatherTickerContent } from "./ui/WeatherTickerContent";

const SEVERITY_RANK: Record<string, number> = {
  Extreme: 4,
  Severe: 3,
  Moderate: 2,
  Minor: 1,
  Unknown: 0,
};

export const weatherFeature: FeatureDefinition<WeatherData, WeatherFilter> = {
  id: "weather",
  label: "WEATHER",
  icon: CloudAlert,

  matchesFilter: (
    _item: BasePoint & { data: WeatherData },
    filter: WeatherFilter,
  ) => {
    if (!filter.enabled) return false;
    if (filter.minSeverity > 0) {
      const rank = SEVERITY_RANK[_item.data?.severity ?? "Unknown"] ?? 0;
      if (rank < filter.minSeverity) return false;
    }
    return true;
  },

  defaultFilter: { enabled: true, minSeverity: 0 },

  buildDetailRows: (data: WeatherData, timestamp?: string) =>
    buildWeatherDetailRows(data, timestamp),

  TickerContent: WeatherTickerContent,

  getSearchText: (data: WeatherData) =>
    [
      data.event,
      data.headline,
      data.severity,
      data.areaDesc,
      data.senderName,
    ]
      .filter(Boolean)
      .join(" "),
};
