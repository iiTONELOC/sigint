import { BaseProvider } from "@/features/base/BaseProvider";
import { createWorkerSourceFeed } from "@/features/base/workerSourceFeed";
import { fetchShipSnapshot } from "@/features/tracking/ships/data/fetch";
import { isShipPoint } from "@/features/tracking/ships/data/codec";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";

const SHIP_SOURCE = getPointSourceDefinition("ships");

// The DataWorker polls AIS and owns SHIP_SOURCE.cacheKey. This provider reads
// the list the worker already holds instead of fetching it a second time.
const feed = createWorkerSourceFeed({
  source: SHIP_SOURCE.id,
  isPoint: isShipPoint,
  fallbackFetch: async () =>
    Array.from((await fetchShipSnapshot()).entities),
});

export const shipProvider = new BaseProvider({
  id: SHIP_SOURCE.id,
  cacheKey: SHIP_SOURCE.cacheKey,
  ownsCache: false,
  fetchFn: feed.fetch,
});

feed.watch(() => {
  void shipProvider.refresh();
});
