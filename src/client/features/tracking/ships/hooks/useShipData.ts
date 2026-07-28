import {
  useProviderData,
  resolveSourceWith503Unavailable,
  type ProviderDataSource,
} from "@/features/base/useProviderData";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import { shipProvider } from "../data/provider";

const SHIP_SOURCE = getPointSourceDefinition("ships");

export type ShipDataSource = ProviderDataSource;

export function useShipData(
  pollInterval: number = SHIP_SOURCE.pollIntervalMs,
) {
  return useProviderData(shipProvider, pollInterval, resolveSourceWith503Unavailable);
}
