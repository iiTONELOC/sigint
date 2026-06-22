import { CloudAlert } from "lucide-react";
import type { FeatureDefinition, BasePoint } from "@/features/base/types";
import type { WeatherData, WeatherFilter } from "./types";
import { buildWeatherDetailRows } from "./detailRows";
import { WeatherTickerContent } from "./ui/WeatherTickerContent";
import { weatherSeverityRank } from "./severity";

export const weatherFeature: FeatureDefinition<WeatherData, WeatherFilter> = {
  id: "weather",
  label: "WEATHER",
  icon: CloudAlert,
  iconProps: { strokeWidth: 2.5 },

  matchesFilter: (
    _item: BasePoint & { data: WeatherData },
    filter: WeatherFilter,
  ) => {
    if (!filter.enabled) return false;
    if (filter.minSeverity > 0) {
      const rank = weatherSeverityRank(_item.data?.severity);
      if (rank < filter.minSeverity) return false;
    }
    return true;
  },

  defaultFilter: { enabled: true, minSeverity: 0 },

  buildDetailRows: (data: WeatherData, timestamp?: string) =>
    buildWeatherDetailRows(data, timestamp),

  TickerContent: WeatherTickerContent,

  getSearchText: (data: WeatherData) =>
    [data.event, data.headline, data.severity, data.areaDesc, data.senderName]
      .filter(Boolean)
      .join(" "),
};
