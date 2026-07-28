import { Domain } from "@shared/domain/identity";
import { CloudAlert } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { WeatherData, WeatherFilter } from "./types";
import { buildWeatherDetailRows } from "./detailRows";
import { WeatherTickerContent } from "./ui/WeatherTickerContent";
import { WEATHER_UI_QUERIES } from "@/features/environmental/weather/data/uiQueries";

export const weatherFeature: FeatureDefinition<WeatherData, WeatherFilter, Domain.Weather> = {
  id: Domain.Weather,
  label: "WEATHER",
  icon: CloudAlert,
  iconProps: { strokeWidth: 2.5 },

  matchesFilter: (item, filter) =>
    WEATHER_UI_QUERIES.descriptor.matchesFilter(item, filter),

  defaultFilter: { enabled: true, minSeverity: 0 },

  buildDetailRows: (data: WeatherData, timestamp?: string) =>
    buildWeatherDetailRows(data, timestamp),

  TickerContent: WeatherTickerContent,

  getSearchText: (data: WeatherData) =>
    [data.event, data.headline, data.severity, data.areaDesc, data.senderName]
      .filter(Boolean)
      .join(" "),
};
