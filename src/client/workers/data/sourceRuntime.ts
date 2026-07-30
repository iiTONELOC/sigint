import {
  DatasetPatchKind,
  createDatasetStore,
  type DatasetCompleteness,
  type DatasetEntity,
  type DatasetPatch,
  type DatasetQuery,
  type DatasetQueryResult,
} from "@/workers/data/datasetStore";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import { SourceStatus } from "@shared/domain/sourceStatus";
import { SourceCompleteness, type SourceId } from "@shared/source";
import { isRecord } from "@shared/geo";

export type PointSourceCacheSnapshot<TEntity extends DatasetEntity> = Readonly<{
  timestamp: number;
  version: number;
  entities: readonly TEntity[];
}>;

export type PointSourceFetchSnapshot<TEntity extends DatasetEntity> = Readonly<{
  completeness: DatasetCompleteness;
  entities: readonly TEntity[];
  observedAt: number;
}>;

export type PointSourceSchedule = (
  callback: () => void,
  delayMs: number,
) => () => void;

export type PointSourceRuntimeOptions<TEntity extends DatasetEntity> = Readonly<{
  id: SourceId;
  cacheKey: string;
  pollIntervalMs: number;
  retryIntervalMs?: number;
  maxQueryItems: number;
  hasChanged?: (previous: TEntity, next: TEntity) => boolean;
  readCache: () => Promise<unknown>;
  parseCache: (value: unknown) => readonly TEntity[] | null;
  persistCache: (
    snapshot: PointSourceCacheSnapshot<TEntity>,
  ) => Promise<void> | void;
  fetchSnapshot: () => Promise<PointSourceFetchSnapshot<TEntity>>;
  publishStatus: (status: DataWorkerSourceSnapshot) => void;
  publishPatch: (patch: DatasetPatch<TEntity>) => void;
  failureStatus?: (error: unknown) => SourceStatus;
  schedule?: PointSourceSchedule;
}>;

export type PointSourceRuntime<TEntity extends DatasetEntity> = Readonly<{
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => void;
  rebase: () => DatasetPatch<TEntity> | null;
  get: (id: string) => TEntity | null;
  values: () => readonly TEntity[];
  snapshot: () => DataWorkerSourceSnapshot;
  query: (
    query: DatasetQuery<TEntity>,
  ) => Promise<DatasetQueryResult<TEntity>>;
}>;

type CacheEnvelope = Readonly<{
  timestamp: number;
  version: number;
  entities: unknown;
}>;

enum SourceCacheVersion {
  Initial = 1,
}

enum SourceRuntimeError {
  UpdateFailed = "The source update failed",
}

function parseCacheEnvelope(value: unknown): CacheEnvelope | null {
  if (!isRecord(value)) return null;
  if (typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp)) {
    return null;
  }
  const version = value.version ?? SourceCacheVersion.Initial;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < SourceCacheVersion.Initial
  ) {
    return null;
  }
  const entities = value.entities ?? value.data;
  return { timestamp: value.timestamp, version, entities };
}

function errorMessage(value: unknown): string {
  return value instanceof Error
    ? value.message
    : SourceRuntimeError.UpdateFailed;
}

function defaultSchedule(callback: () => void, delayMs: number): () => void {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
}

export function createPointSourceRuntime<TEntity extends DatasetEntity>(
  options: PointSourceRuntimeOptions<TEntity>,
): PointSourceRuntime<TEntity> {
  const store = createDatasetStore<TEntity>({
    maxQueryItems: options.maxQueryItems,
    ...(options.hasChanged ? { hasChanged: options.hasChanged } : {}),
  });
  const schedule = options.schedule ?? defaultSchedule;
  const retryIntervalMs = options.retryIntervalMs ?? options.pollIntervalMs;

  let lastUpdatedAt: number | null = null;
  let published: DataWorkerSourceSnapshot = {
    source: options.id,
    version: 0,
    status: SourceStatus.Loading,
    loading: true,
    count: 0,
    lastUpdatedAt: null,
    error: null,
  };
  let cachedValues: readonly TEntity[] | null = null;
  let refreshTask: Promise<boolean> | null = null;
  let cancelScheduled: (() => void) | null = null;
  let active = false;

  const values = (): readonly TEntity[] => {
    cachedValues ??= Array.from(store.values());
    return cachedValues;
  };

  const publishStatus = (
    status: SourceStatus,
    loading: boolean,
    error: string | null,
  ): void => {
    published = {
      source: options.id,
      version: store.version(),
      status,
      loading,
      count: store.size(),
      lastUpdatedAt,
      error,
    };
    options.publishStatus(published);
  };

  const applySnapshot = async (
    snapshot: PointSourceFetchSnapshot<TEntity>,
    version: number,
  ): Promise<void> => {
    const patch = await store.applySnapshot({
      version,
      completeness: snapshot.completeness,
      entities: snapshot.entities,
    });
    cachedValues = null;
    lastUpdatedAt = snapshot.observedAt;
    options.publishPatch(patch);
  };

  const retainAfterFailure = (error: unknown): void => {
    const message = errorMessage(error);
    if (store.size() > 0) {
      publishStatus(SourceStatus.Cached, false, message);
      return;
    }
    publishStatus(
      options.failureStatus?.(error) ?? SourceStatus.Error,
      false,
      message,
    );
  };

  const performRefresh = async (): Promise<boolean> => {
    publishStatus(published.status, true, null);
    try {
      const snapshot = await options.fetchSnapshot();
      await applySnapshot(snapshot, store.version() + 1);
      await options.persistCache({
        timestamp: snapshot.observedAt,
        version: store.version(),
        entities: values(),
      });
      publishStatus(
        store.size() === 0 ? SourceStatus.Empty : SourceStatus.Live,
        false,
        null,
      );
      return true;
    } catch (error) {
      retainAfterFailure(error);
      return false;
    }
  };

  const runRefresh = async (): Promise<boolean> => {
    if (refreshTask) return refreshTask;
    const task = performRefresh();
    refreshTask = task;
    try {
      return await task;
    } finally {
      if (refreshTask === task) refreshTask = null;
    }
  };

  const scheduleNext = (succeeded: boolean): void => {
    if (!active) return;
    cancelScheduled?.();
    cancelScheduled = schedule(() => {
      cancelScheduled = null;
      void runRefresh().then(scheduleNext);
    }, succeeded ? options.pollIntervalMs : retryIntervalMs);
  };

  return {
    async hydrate(): Promise<void> {
      const envelope = parseCacheEnvelope(await options.readCache());
      if (!envelope) return;
      const entities = options.parseCache(envelope.entities);
      if (!entities) return;
      await applySnapshot(
        {
          completeness: SourceCompleteness.Complete,
          entities,
          observedAt: envelope.timestamp,
        },
        envelope.version,
      );
      publishStatus(SourceStatus.Cached, false, null);
    },

    async refresh(): Promise<void> {
      await runRefresh();
    },

    async start(): Promise<void> {
      if (active) return;
      active = true;
      scheduleNext(await runRefresh());
    },

    stop(): void {
      active = false;
      cancelScheduled?.();
      cancelScheduled = null;
    },

    rebase(): DatasetPatch<TEntity> | null {
      const version = store.version();
      if (version === 0) return null;
      return {
        kind: DatasetPatchKind.Rebase,
        version,
        upserts: values(),
        deletedIds: [],
      };
    },

    get(id: string): TEntity | null {
      return store.get(id);
    },

    values,

    snapshot(): DataWorkerSourceSnapshot {
      return published;
    },

    query(
      query: DatasetQuery<TEntity>,
    ): Promise<DatasetQueryResult<TEntity>> {
      return store.query(query);
    },
  };
}
