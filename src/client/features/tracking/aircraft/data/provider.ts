import { type DataPoint } from "@/features/base/dataPoints";
import { BaseProvider } from "@/features/base/BaseProvider";
import { createWorkerSourceFeed } from "@/features/base/workerSourceFeed";
import { isAircraftPoint } from "@/features/tracking/aircraft/data/codec";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";

import { fetchAircraftSnapshot } from "./parseAdsbV2";

const AIRCRAFT_SOURCE = getPointSourceDefinition("aircraft");

export type AircraftProviderConfig = {
  cacheDurationMs?: number;
  cacheKey?: string;
};

/** Server enrichment and source state are authoritative. */
export class AircraftProvider extends BaseProvider {
  constructor(config: AircraftProviderConfig = {}) {
    // The DataWorker polls ADS-B and owns AIRCRAFT_SOURCE.cacheKey. This
    // provider reads the list the worker already holds instead of fetching
    // it a second time.
    const feed = createWorkerSourceFeed({
      source: AIRCRAFT_SOURCE.id,
      isPoint: isAircraftPoint,
      fallbackFetch: fetchAircraftSnapshot,
    });
    super({
      id: AIRCRAFT_SOURCE.id,
      cacheKey: config.cacheKey ?? AIRCRAFT_SOURCE.cacheKey,
      ...(config.cacheDurationMs === undefined
        ? {}
        : { maxCacheAgeMs: config.cacheDurationMs }),
      ownsCache: false,
      fetchFn: feed.fetch,
    });
    feed.watch(() => {
      void this.refresh();
    });
  }

  /** Selection compatibility hook; enrichment is server-owned. */
  async enrichAircraftByIcao24(
    _icao24List: string[],
  ): Promise<DataPoint[] | null> {
    return null;
  }
}
