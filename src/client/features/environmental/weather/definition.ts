import { Domain } from "@shared/domain/identity";
import { CloudAlert } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { WeatherData } from "./types";
import { buildWeatherDetailRows } from "./detailRows";
import { WeatherTickerContent } from "./ui/WeatherTickerContent";
import { weatherSearchText } from "@/features/environmental/weather/data/uiQueries";
import {
  weatherFeedPresentation,
  weatherTablePresentation,
} from "./formatters";

export const weatherFeature = defineFeature<WeatherData, Domain.Weather>({
  id: Domain.Weather,
  label: Domain.Weather.toUpperCase(),
  icon: CloudAlert,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Weather,
  includeInRawFeed: true,

  buildDetailRows: buildWeatherDetailRows,
  tablePresentation: weatherTablePresentation,
  feedPresentation: weatherFeedPresentation,

  TickerContent: WeatherTickerContent,

  getSearchText: weatherSearchText,
});
