import { useProviderData, type ProviderDataSource } from "@/features/base/useProviderData";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import { weatherProvider } from "../data/provider";

export type WeatherDataSource = ProviderDataSource;

export function useWeatherData(pollInterval: number = POLL_INTERVALS.weather) {
  return useProviderData(weatherProvider, pollInterval);
}
