import { Domain } from "@shared/domain/identity";
import { CloudAlert } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { WeatherData, WeatherFilter } from "./types";
import { buildWeatherDetailRows } from "./detailRows";
import { WeatherTickerContent } from "./ui/WeatherTickerContent";
import {
  WEATHER_UI_QUERIES,
  weatherSearchText,
} from "@/features/environmental/weather/data/uiQueries";

const ICON_STROKE_WIDTH = 2.5;
const DEFAULT_MIN_SEVERITY = 0;

export const weatherFeature: FeatureDefinition<
  WeatherData,
  WeatherFilter,
  Domain.Weather
> = {
  id: Domain.Weather,
  label: Domain.Weather.toUpperCase(),
  icon: CloudAlert,
  iconProps: { strokeWidth: ICON_STROKE_WIDTH },

  matchesFilter: (item, filter) =>
    WEATHER_UI_QUERIES.descriptor.matchesFilter(item, filter),

  defaultFilter: { enabled: true, minSeverity: DEFAULT_MIN_SEVERITY },

  buildDetailRows: buildWeatherDetailRows,

  TickerContent: WeatherTickerContent,

  getSearchText: weatherSearchText,
};
