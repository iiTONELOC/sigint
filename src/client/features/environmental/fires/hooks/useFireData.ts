import {
  useProviderData,
  resolveSourceWith503Unavailable,
  type ProviderDataSource,
} from "@/features/base/useProviderData";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import { fireProvider } from "../data/provider";

export type FireDataSource = ProviderDataSource;

export function useFireData(pollInterval: number = POLL_INTERVALS.fires) {
  return useProviderData(fireProvider, pollInterval, resolveSourceWith503Unavailable);
}
