import {
  createDatasetStore,
  type DatasetEntity,
  type DatasetPatch,
  type DatasetQuery,
  type DatasetQueryResult,
} from "@/workers/data/datasetStore";
import type { DataSourceId } from "@/workers/data/sourceIds";
import { isRecord } from "@shared/geo";

export type PointSourceStatus =
  | "loading"
  | "cached"
  | "live"
  | "empty"
  | "error";

export type PointSourceStatusSnapshot = Readonly<{
  source: DataSourceId;
  version: number;
  status: PointSourceStatus;
  loading: boolean;
  count: number;
  lastUpdatedAt: number | null;
  error: string | null;
}>;

export type PointSourceCacheSnapshot<TEntity extends DatasetEntity> = Readonly<{
  timestamp: number;
  version: number;
  entities: readonly TEntity[];
}>;

export type PointSourceFetchSnapshot<TEntity extends DatasetEntity> = Readonly<{
  completeness: "complete" | "partial";
  entities: readonly TEntity[];
  observedAt: number;
}>;

export type PointSourceRuntimeOptions<TEntity extends DatasetEntity> = Readonly<{
  id: DataSourceId;
  cacheKey: string;
  pollIntervalMs: number;
  maxQueryItems: number;
  hasChanged?: (previous: TEntity, next: TEntity) => boolean;
  readCache: () => Promise<unknown | null>;
  parseCache: (value: unknown) => readonly TEntity[] | null;
  persistCache: (
    snapshot: PointSourceCacheSnapshot<TEntity>,
  ) => Promise<void>;
  fetchSnapshot: () => Promise<PointSourceFetchSnapshot<TEntity>>;
  publishStatus: (status: PointSourceStatusSnapshot) => void;
  publishPatch: (patch: DatasetPatch<TEntity>) => void;
}>;

export type PointSourceRuntime<TEntity extends DatasetEntity> = Readonly<{
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  start: () => void;
  stop: () => void;
  rebase: () => DatasetPatch<TEntity> | null;
  get: (id: string) => TEntity | null;
  query: (
    query: DatasetQuery<TEntity>,
  ) => Promise<DatasetQueryResult<TEntity>>;
}>;

type CacheEnvelope = Readonly<{
  timestamp: number;
  version: number;
  entities: unknown;
}>;

function parseCacheEnvelope(value: unknown): CacheEnvelope | null {
  if (!isRecord(value)) return null;
  if (typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp)) {
    return null;
  }
  const version = value.version ?? 1;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1
  ) {
    return null;
  }
  const entities = value.entities ?? value.data;
  return {
    timestamp: value.timestamp,
    version,
    entities,
  };
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "The source update failed";
}

export function createPointSourceRuntime<TEntity extends DatasetEntity>(
  options: PointSourceRuntimeOptions<TEntity>,
): PointSourceRuntime<TEntity> {
  const store = createDatasetStore<TEntity>({
    maxQueryItems: options.maxQueryItems,
    ...(options.hasChanged ? { hasChanged: options.hasChanged } : {}),
  });
  let lastUpdatedAt: number | null = null;
  let currentStatus: PointSourceStatus = "loading";
  let refreshTask: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;

  const publishStatus = (
    status: PointSourceStatus,
    loading: boolean,
    error: string | null,
  ): void => {
    currentStatus = status;
    options.publishStatus({
      source: options.id,
      version: store.version(),
      status,
      loading,
      count: store.size(),
      lastUpdatedAt,
      error,
    });
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
    lastUpdatedAt = snapshot.observedAt;
    options.publishPatch(patch);
  };

  const performRefresh = async (): Promise<void> => {
    publishStatus(currentStatus, true, null);
    try {
      const snapshot = await options.fetchSnapshot();
      await applySnapshot(snapshot, store.version() + 1);
      await options.persistCache({
        timestamp: snapshot.observedAt,
        version: store.version(),
        entities: Array.from(store.values()),
      });
      publishStatus(store.size() === 0 ? "empty" : "live", false, null);
    } catch (error) {
      publishStatus("error", false, errorMessage(error));
    }
  };

  const refresh = async (): Promise<void> => {
    if (refreshTask) return refreshTask;
    const task = performRefresh();
    refreshTask = task;
    try {
      await task;
    } finally {
      if (refreshTask === task) refreshTask = null;
    }
  };

  const scheduleRefresh = (): void => {
    if (!active) return;
    timer = setTimeout(() => {
      void refresh().then(scheduleRefresh);
    }, options.pollIntervalMs);
  };

  return {
    async hydrate(): Promise<void> {
      const envelope = parseCacheEnvelope(await options.readCache());
      if (!envelope) return;
      const entities = options.parseCache(envelope.entities);
      if (!entities) return;
      await applySnapshot(
        {
          completeness: "complete",
          entities,
          observedAt: envelope.timestamp,
        },
        envelope.version,
      );
      publishStatus("cached", false, null);
    },

    refresh,

    start(): void {
      if (active) return;
      active = true;
      void refresh().then(scheduleRefresh);
    },

    stop(): void {
      active = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },

    rebase(): DatasetPatch<TEntity> | null {
      const version = store.version();
      if (version === 0) return null;
      return {
        kind: "rebase",
        version,
        upserts: Array.from(store.values()),
        deletedIds: [],
      };
    },

    get(id: string): TEntity | null {
      return store.get(id);
    },

    query(
      query: DatasetQuery<TEntity>,
    ): Promise<DatasetQueryResult<TEntity>> {
      return store.query(query);
    },
  };
}
