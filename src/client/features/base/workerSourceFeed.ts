import type { DataPoint } from "@/features/base/dataPoints";
import { parsePointList } from "@/features/base/pointCodec";
import type { ProviderFetchResult } from "@/features/base/types";
import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import type { DataWorkerPointSource } from "@/workers/data/protocol";

type ProviderFetch = () => Promise<
  DataPoint[] | ProviderFetchResult<DataPoint>
>;

export type WorkerSourceFeedOptions<TPoint extends DataPoint> = Readonly<{
  source: DataWorkerPointSource;
  isPoint: (value: unknown) => value is TPoint;
  fallbackFetch: ProviderFetch;
}>;

export type WorkerSourceFeed = Readonly<{
  fetch: ProviderFetch;
  watch: (onVersionChange: () => void) => () => void;
}>;

const NO_VERSION = -1;

export function createWorkerSourceFeed<TPoint extends DataPoint>(
  options: WorkerSourceFeedOptions<TPoint>,
): WorkerSourceFeed {
  let deliveredVersion = NO_VERSION;
  let delivered: DataPoint[] = [];

  return {
    async fetch(): Promise<DataPoint[] | ProviderFetchResult<DataPoint>> {
      const client = getDataWorkerClient();
      if (!client) return options.fallbackFetch();

      const version =
        client.getSourceSnapshot(options.source)?.version ?? NO_VERSION;
      if (version !== NO_VERSION && version === deliveredVersion) {
        return delivered;
      }

      // Any failure of the worker path (build failure, terminated worker,
      // unparseable reply) falls back to fetching directly, so a broken
      // worker degrades to the previous behaviour instead of a dead feed.
      const points = await client
        .listSourceEntities(options.source)
        .then((value) => parsePointList(value, options.isPoint))
        .catch(() => null);
      if (!points) return options.fallbackFetch();

      deliveredVersion = version;
      delivered = points;
      return points;
    },

    watch(onVersionChange: () => void): () => void {
      const client = getDataWorkerClient();
      if (!client) return () => {};
      let seen = NO_VERSION;
      return client.subscribeSource(options.source, (snapshot) => {
        if (snapshot.version === seen) return;
        seen = snapshot.version;
        onVersionChange();
      });
    },
  };
}
