import {
  decodeShipPoints,
  parseShipServerPayload,
  type ShipPoint,
} from "@/features/tracking/ships/data/codec";
import { authenticatedFetch } from "@/lib/net/authService";
import type { DatasetCompleteness } from "@/workers/data/datasetStore";

const SHIPS_URL = "/api/ships/latest";

export type ShipFetchSnapshot = Readonly<{
  completeness: DatasetCompleteness;
  entities: readonly ShipPoint[];
  observedAt: number;
}>;

export type ShipFetchOptions = Readonly<{
  fetcher?: (url: string) => Promise<Response>;
  now?: () => number;
}>;

export async function fetchShipSnapshot(
  options: ShipFetchOptions = {},
): Promise<ShipFetchSnapshot> {
  const fetcher = options.fetcher ?? authenticatedFetch;
  const response = await fetcher(SHIPS_URL);
  if (!response.ok) {
    throw new Error(
      `The ships request failed with status ${response.status}`,
    );
  }
  const payload = parseShipServerPayload(await response.json());
  if (!payload) {
    throw new Error("The ships response format is invalid");
  }
  return {
    completeness:
      payload.connected &&
      payload.vesselCount === payload.vessels.length
        ? "complete"
        : "partial",
    entities: decodeShipPoints(payload),
    observedAt: (options.now ?? Date.now)(),
  };
}
