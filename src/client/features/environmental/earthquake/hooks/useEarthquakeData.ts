import { useProviderData, type ProviderDataSource } from "@/features/base/useProviderData";
import { earthquakeProvider } from "../data/provider";

export type EarthquakeDataSource = ProviderDataSource;

export function useEarthquakeData(pollInterval: number = 420_000) {
  return useProviderData(earthquakeProvider, pollInterval);
}
