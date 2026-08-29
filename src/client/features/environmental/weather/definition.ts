import { Domain } from "@shared/domain/identity";
import { CloudAlert } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { WeatherData } from "@shared/domain/weather";
import { WeatherDetailSummary } from "./ui/WeatherDetailSummary";
import { WeatherTickerContent } from "./ui/WeatherTickerContent";
import { weatherSearchText } from "@/features/environmental/weather/data/uiQueries";
import {
  primaryWeatherArea,
  WeatherCopy,
  weatherFeedPresentation,
  weatherTablePresentation,
} from "./formatters/presentation";

export const weatherFeature = defineFeature<WeatherData, Domain.Weather>({
  id: Domain.Weather,
  label: Domain.Weather.toUpperCase(),
  icon: CloudAlert,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Weather,
  includeInRawFeed: true,
  DetailSummary: WeatherDetailSummary,

  alertDetail: (data) => [primaryWeatherArea(data.areaDesc)],
  buildDetailRows: () => [],
  tablePresentation: weatherTablePresentation,
  feedPresentation: weatherFeedPresentation,

  TickerContent: WeatherTickerContent,
  tickerSummary: (data) => [data.event || WeatherCopy.TickerAlert],

  getSearchText: weatherSearchText,
});
