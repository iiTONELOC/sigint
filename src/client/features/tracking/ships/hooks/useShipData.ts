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

// 15 s default matches aircraft. AIS streams continuously via the
// server's WebSocket → 15 s/min × ~50 vessels/sec ≈ ~750 vessel-
// updates per poll. The previous 300 s left clients on a fragment of
// the server's vessel map for several minutes after page load.
export const DEFAULT_SHIP_POLL_MS = 15_000;

export function useShipData(pollInterval: number = DEFAULT_SHIP_POLL_MS) {
  return useProviderData(shipProvider, pollInterval, resolveShipSource);
}
