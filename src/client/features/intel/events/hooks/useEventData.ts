import { useProviderData, type ProviderDataSource } from "@/features/base/useProviderData";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import { gdeltProvider } from "../data/provider";

export type EventDataSource = ProviderDataSource;

export function useEventData(pollInterval: number = POLL_INTERVALS.events) {
  return useProviderData(gdeltProvider, pollInterval);
}
