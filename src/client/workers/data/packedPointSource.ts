import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import { SourceCompletenessPolicy } from "@shared/domain/sourcePolicy";
import type { DatasetEntity } from "@/workers/data/datasetStore";
import type {
  DataWorkerSourceSnapshot,
  DataWorkerSourceStatus,
} from "@/workers/data/protocol";
import type { SourceId } from "@shared/source";
import {
  createPointSourceRuntime,
  type PointSourceCacheSnapshot,
  type PointSourceRuntime,
  type PointSourceSchedule,
} from "@/workers/data/sourceRuntime";

export type PackedPointSourcePolicy = Readonly<{
  id: SourceId;
  cacheKey: string;
  pollIntervalMs: number;
  retryIntervalMs: number;
}>;

export type PackedPointSourceOptions<TEntity extends DatasetEntity> = Readonly<{
  parseEntity: (value: unknown) => TEntity | null;
  fetchPoints: () => Promise<TEntity[]>;
  readCache: () => Promise<unknown>;
  persistCache: (
    snapshot: PointSourceCacheSnapshot<TEntity>,
  ) => Promise<void> | void;
  publishStatus: (snapshot: DataWorkerSourceSnapshot) => void;
  publishRebase: (entities: readonly TEntity[]) => void;
  failureStatus?: (error: unknown) => DataWorkerSourceStatus;
  now?: () => number;
  schedule?: PointSourceSchedule;
}>;

export type PackedPointSource<TEntity extends DatasetEntity> =
  PointSourceRuntime<TEntity> & Readonly<{ publishRebase: () => void }>;

export function createPackedPointSource<TEntity extends DatasetEntity>(
  policy: PackedPointSourcePolicy,
  options: PackedPointSourceOptions<TEntity>,
): PackedPointSource<TEntity> {
  const now = options.now ?? Date.now;

  const parseCache = (value: unknown): readonly TEntity[] | null => {
    if (!Array.isArray(value)) return null;
    const entities: TEntity[] = [];
    for (const candidate of value) {
      const entity = options.parseEntity(candidate);
      if (!entity) return null;
      entities.push(entity);
    }
    return entities;
  };

  const runtime = createPointSourceRuntime<TEntity>({
    id: policy.id,
    cacheKey: policy.cacheKey,
    pollIntervalMs: policy.pollIntervalMs,
    retryIntervalMs: policy.retryIntervalMs,
    maxQueryItems: POINT_UI_QUERY_POLICY.datasetQueryLimit,
    readCache: options.readCache,
    parseCache,
    persistCache: options.persistCache,
    fetchSnapshot: async () => ({
      completeness: SourceCompletenessPolicy.Complete,
      entities: await options.fetchPoints(),
      observedAt: now(),
    }),
    publishStatus: options.publishStatus,
    publishPatch: () => {
      options.publishRebase(runtime.values());
    },
    ...(options.failureStatus ? { failureStatus: options.failureStatus } : {}),
    ...(options.schedule ? { schedule: options.schedule } : {}),
  });

  return {
    ...runtime,
    publishRebase(): void {
      options.publishRebase(runtime.values());
    },
  };
}
