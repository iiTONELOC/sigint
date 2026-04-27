import {
  useProviderData,
  type ProviderDataSource,
} from "@/features/base/useProviderData";
import { cycloneProvider } from "../data/provider";

export type CycloneDataSource = ProviderDataSource;

/**
 * Subscribe to the cyclone provider. Default poll is 30 minutes —
 * NHC publishes regular advisories every 6h with intermediate updates
 * every 3h. 30 min keeps the UI responsive without burning capacity.
 */
export function useCycloneData(pollInterval: number = 30 * 60_000) {
  return useProviderData(cycloneProvider, pollInterval);
}
