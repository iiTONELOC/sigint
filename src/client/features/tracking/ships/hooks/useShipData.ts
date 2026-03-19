import {
  useProviderData,
  type ProviderDataSource,
  type ResolveDataSource,
} from "@/features/base/useProviderData";
import { shipProvider } from "../data/provider";

export type ShipDataSource = ProviderDataSource;

const resolveShipSource: ResolveDataSource = (data, snapshot) => {
  if (snapshot.error) {
    if (data.length > 0) return "cached";
    // 503 from server means AISSTREAM_API_KEY not set
    const is503 = snapshot.error.message.includes("503");
    return is503 ? "unavailable" : "error";
  }
  return data.length > 0 ? "live" : "unavailable";
};

export function useShipData(pollInterval: number = 300_000) {
  return useProviderData(shipProvider, pollInterval, resolveShipSource);
}
