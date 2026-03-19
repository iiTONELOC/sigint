import { useProviderData, type ProviderDataSource } from "@/features/base/useProviderData";
import { gdeltProvider } from "../data/provider";

export type EventDataSource = ProviderDataSource;

export function useEventData(pollInterval: number = 900_000) {
  return useProviderData(gdeltProvider, pollInterval);
}
