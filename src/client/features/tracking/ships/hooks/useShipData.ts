import {
  useProviderData,
  resolveSourceWith503Unavailable,
  type ProviderDataSource,
} from "@/features/base/useProviderData";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import { shipProvider } from "../data/provider";

export type ShipDataSource = ProviderDataSource;

export function useShipData(pollInterval: number = POLL_INTERVALS.ships) {
  return useProviderData(shipProvider, pollInterval, resolveSourceWith503Unavailable);
}
