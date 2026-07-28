import { BaseProvider } from "@/features/base/BaseProvider";
import { createWorkerSourceFeed } from "@/features/base/workerSourceFeed";
import { isEventPoint } from "@/features/intel/events/data/codec";
import { fetchEventSnapshot } from "@/features/intel/events/data/fetch";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";

const EVENT_SOURCE = getPointSourceDefinition("events");

// The DataWorker polls GDELT, owns the rolling window and owns
// EVENT_SOURCE.cacheKey. This provider reads the list the worker already
// holds rather than fetching and merging a second copy.
const feed = createWorkerSourceFeed({
  source: EVENT_SOURCE.id,
  isPoint: isEventPoint,
  fallbackFetch: async () => [...(await fetchEventSnapshot()).entities],
});

export const gdeltProvider = new BaseProvider({
  id: EVENT_SOURCE.id,
  cacheKey: EVENT_SOURCE.cacheKey,
  ownsCache: false,
  fetchFn: feed.fetch,
});

feed.watch(() => {
  void gdeltProvider.refresh();
});
