import type {
  DataWorkerPointSource,
  DataWorkerSourceSnapshot,
} from "@/workers/data/protocol";

export type PointSourceCacheSnapshot<TPoint> = Readonly<{
  timestamp: number;
  data: TPoint[];
}>;

export type PointSourceOwnerPolicy<TSource extends DataWorkerPointSource> =
  Readonly<{
    source: TSource;
    pollIntervalMs: number;
    retryIntervalMs: number;
    failureMessage: string;
  }>;

export type PointSourceOwnerDependencies<TPoint> = Readonly<{
  readCache: () => Promise<unknown | null>;
  parseCache: (value: unknown) => PointSourceCacheSnapshot<TPoint> | null;
  persistCache: (snapshot: PointSourceCacheSnapshot<TPoint>) => void;
  fetchPoints: () => Promise<TPoint[]>;
  publish: (snapshot: DataWorkerSourceSnapshot) => void;
  rebaseRender: (points: readonly TPoint[]) => void;
  failureStatus?: (error: unknown) => "error" | "unavailable";
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => () => void;
}>;

export type PointSourceOwner<TPoint> = Readonly<{
  start: () => Promise<void>;
  refresh: () => Promise<void>;
  rebase: () => void;
  snapshot: () => DataWorkerSourceSnapshot;
  read: () => readonly TPoint[];
  find: (id: string) => TPoint | null;
}>;

type IdentifiedPoint = Readonly<{ id: string }>;

export function createPointSourceOwner<
  TSource extends DataWorkerPointSource,
  TPoint extends IdentifiedPoint,
>(
  policy: PointSourceOwnerPolicy<TSource>,
  dependencies: PointSourceOwnerDependencies<TPoint>,
): PointSourceOwner<TPoint> {
  const now = dependencies.now ?? Date.now;
  const schedule =
    dependencies.schedule ??
    ((callback: () => void, delayMs: number) => {
      const handle = setTimeout(callback, delayMs);
      return () => clearTimeout(handle);
    });
  let snapshot: DataWorkerSourceSnapshot = {
    source: policy.source,
    version: 0,
    status: "loading",
    loading: true,
    count: 0,
    lastUpdatedAt: null,
    error: null,
  };
  let points: readonly TPoint[] = [];
  let pointsById = new Map<string, TPoint>();
  let startInFlight: Promise<void> | null = null;
  let startupComplete = false;
  let refreshInFlight: Promise<void> | null = null;
  let cancelScheduledRefresh: (() => void) | null = null;

  const publish = (
    update: Omit<DataWorkerSourceSnapshot, "source" | "version">,
  ): void => {
    snapshot = {
      source: policy.source,
      ...update,
      version: snapshot.version + 1,
    };
    dependencies.publish(snapshot);
  };

  const replace = (nextPoints: readonly TPoint[]): void => {
    points = nextPoints;
    pointsById = new Map(nextPoints.map((point) => [point.id, point]));
  };

  const scheduleRefresh = (delayMs: number): void => {
    cancelScheduledRefresh?.();
    cancelScheduledRefresh = schedule(() => {
      cancelScheduledRefresh = null;
      void refresh();
    }, delayMs);
  };

  const accept = (nextPoints: TPoint[], receivedAt: number): void => {
    replace(nextPoints);
    publish({
      status: nextPoints.length > 0 ? "live" : "empty",
      loading: false,
      count: nextPoints.length,
      lastUpdatedAt: receivedAt,
      error: null,
    });
    dependencies.rebaseRender(nextPoints);
    dependencies.persistCache({ timestamp: receivedAt, data: nextPoints });
  };

  const retainAfterFailure = (error: unknown): void => {
    const message =
      error instanceof Error ? error.message : policy.failureMessage;
    if (points.length > 0) {
      publish({
        status: "cached",
        loading: false,
        count: points.length,
        lastUpdatedAt: snapshot.lastUpdatedAt,
        error: message,
      });
      return;
    }
    publish({
      status: dependencies.failureStatus?.(error) ?? "error",
      loading: false,
      count: 0,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      error: message,
    });
  };

  const runRefresh = async (): Promise<void> => {
    publish({
      status: snapshot.status,
      loading: true,
      count: points.length,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      error: null,
    });
    try {
      accept(await dependencies.fetchPoints(), now());
      scheduleRefresh(policy.pollIntervalMs);
    } catch (error) {
      retainAfterFailure(error);
      scheduleRefresh(policy.retryIntervalMs);
    }
  };

  const executeRefresh = (): Promise<void> => {
    if (refreshInFlight) return refreshInFlight;
    cancelScheduledRefresh?.();
    cancelScheduledRefresh = null;
    const operation = runRefresh().finally(() => {
      if (refreshInFlight === operation) refreshInFlight = null;
    });
    refreshInFlight = operation;
    return operation;
  };

  const start = (): Promise<void> => {
    if (startInFlight) return startInFlight;
    startInFlight = (async () => {
      dependencies.publish(snapshot);
      const cached = dependencies.parseCache(
        await dependencies.readCache().catch(() => null),
      );
      if (cached) {
        replace(cached.data);
        publish({
          status: "cached",
          loading: true,
          count: cached.data.length,
          lastUpdatedAt: cached.timestamp,
          error: null,
        });
        dependencies.rebaseRender(cached.data);
      }
      await executeRefresh();
      startupComplete = true;
    })();
    return startInFlight;
  };

  const refresh = (): Promise<void> => {
    if (!startInFlight) return start();
    if (!startupComplete) return startInFlight;
    return executeRefresh();
  };

  return {
    start,
    refresh,
    rebase(): void {
      dependencies.rebaseRender(points);
    },
    snapshot(): DataWorkerSourceSnapshot {
      return snapshot;
    },
    read(): readonly TPoint[] {
      return points;
    },
    find(id): TPoint | null {
      return pointsById.get(id) ?? null;
    },
  };
}
