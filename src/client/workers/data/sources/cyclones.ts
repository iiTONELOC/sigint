import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import { Domain } from "@shared/domain/identity";
import {
  isCyclonePoint,
  parseCycloneCache,
  type CyclonePoint,
} from "@/features/environmental/cyclones/data/codec";
import { fetchCurrentStorms } from "@/features/environmental/cyclones/data/parseNhc";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import {
  createPointSourceRuntime,
  type PointSourceCacheSnapshot,
  type PointSourceFetchSnapshot,
  type PointSourceRuntime,
} from "@/workers/data/sourceRuntime";

export const CYCLONE_SOURCE = getPointSourceDefinition(Domain.Cyclones);

export type CycloneSourceRuntime = PointSourceRuntime<CyclonePoint> &
  Readonly<{ publishRebase: () => void }>;

export type CycloneSourceRuntimeOptions = Readonly<{
  readCache: () => Promise<unknown>;
  persistCache: (
    snapshot: PointSourceCacheSnapshot<CyclonePoint>,
  ) => Promise<void> | void;
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<CyclonePoint>>;
  publishStatus: (status: DataWorkerSourceSnapshot) => void;
  publishPoints: (points: readonly CyclonePoint[]) => void;
  now?: () => number;
}>;

function cycloneChanged(
  previous: CyclonePoint,
  next: CyclonePoint,
): boolean {
  return (
    previous.lat !== next.lat ||
    previous.lon !== next.lon ||
    previous.timestamp !== next.timestamp ||
    previous.data.advisoryNumber !== next.data.advisoryNumber ||
    previous.data.maxWindKt !== next.data.maxWindKt ||
    previous.data.classification !== next.data.classification ||
    previous.data.forecast.length !== next.data.forecast.length
  );
}

export function createCycloneSourceRuntime(
  options: CycloneSourceRuntimeOptions,
): CycloneSourceRuntime {
  const now = options.now ?? Date.now;

  // Out of season NHC legitimately reports zero storms, so an empty result
  // is the truth here rather than a soft failure.
  const fetchStorms = async (): Promise<
    PointSourceFetchSnapshot<CyclonePoint>
  > => ({
    completeness: "complete",
    entities: (await fetchCurrentStorms()).filter(isCyclonePoint),
    observedAt: now(),
  });

  const runtime = createPointSourceRuntime<CyclonePoint>({
    id: CYCLONE_SOURCE.id,
    cacheKey: CYCLONE_SOURCE.cacheKey,
    pollIntervalMs: CYCLONE_SOURCE.pollIntervalMs,
    maxQueryItems: POINT_UI_QUERY_POLICY.datasetQueryLimit,
    hasChanged: cycloneChanged,
    readCache: options.readCache,
    parseCache: parseCycloneCache,
    persistCache: options.persistCache,
    fetchSnapshot: options.fetchSnapshot ?? fetchStorms,
    publishStatus: options.publishStatus,
    publishPatch: () => {
      options.publishPoints(runtime.values());
    },
  });
  return {
    ...runtime,
    publishRebase(): void {
      options.publishPoints(runtime.values());
    },
  };
}
