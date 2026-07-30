import { type DataPoint } from "@/features/base/dataPoints";
import { BaseProvider } from "@/features/base/BaseProvider";

import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { fetchAircraftSnapshot } from "./parseAdsbV2";

const DEFAULT_CACHE_DURATION = 30 * 60_000;
const DEFAULT_CACHE_KEY = CACHE_KEYS.aircraft;

export type AircraftProviderConfig = {
  cacheDurationMs?: number;
  cacheKey?: string;
};

/** Server enrichment and source state are authoritative. */
export class AircraftProvider extends BaseProvider {
  constructor(config: AircraftProviderConfig = {}) {
    super({
      id: "aircraft",
      cacheKey: config.cacheKey ?? DEFAULT_CACHE_KEY,
      maxCacheAgeMs: config.cacheDurationMs ?? DEFAULT_CACHE_DURATION,
      fetchFn: fetchAircraftSnapshot,
    });
  }

  /** Selection compatibility hook; enrichment is server-owned. */
  async enrichAircraftByIcao24(
    _icao24List: string[],
  ): Promise<DataPoint[] | null> {
    return null;
  }
}
