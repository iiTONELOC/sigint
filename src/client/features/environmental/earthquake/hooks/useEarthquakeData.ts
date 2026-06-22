import { useProviderData, type ProviderDataSource } from "@/features/base/useProviderData";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import { earthquakeProvider } from "../data/provider";

export type EarthquakeDataSource = ProviderDataSource;

export function useEarthquakeData(pollInterval: number = POLL_INTERVALS.earthquakes) {
  return useProviderData(earthquakeProvider, pollInterval);
}
