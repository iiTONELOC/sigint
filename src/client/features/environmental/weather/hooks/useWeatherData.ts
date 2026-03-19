import { useProviderData, type ProviderDataSource } from "@/features/base/useProviderData";
import { weatherProvider } from "../data/provider";

export type WeatherDataSource = ProviderDataSource;

export function useWeatherData(pollInterval: number = 300_000) {
  return useProviderData(weatherProvider, pollInterval);
}
