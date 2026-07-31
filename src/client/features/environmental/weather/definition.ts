import { Domain } from "@shared/domain/identity";
import { CloudAlert } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { WeatherData, WeatherFilter } from "./types";
import { buildWeatherDetailRows } from "./detailRows";
import { WeatherTickerContent } from "./ui/WeatherTickerContent";
import { weatherSearchText } from "@/features/environmental/weather/data/uiQueries";

const ICON_STROKE_WIDTH = 2.5;

export const weatherFeature: FeatureDefinition<
  WeatherData,
  WeatherFilter,
  Domain.Weather
> = {
  id: Domain.Weather,
  label: Domain.Weather.toUpperCase(),
  icon: CloudAlert,
  iconProps: { strokeWidth: ICON_STROKE_WIDTH },



  buildDetailRows: buildWeatherDetailRows,

  TickerContent: WeatherTickerContent,

  getSearchText: weatherSearchText,
};
