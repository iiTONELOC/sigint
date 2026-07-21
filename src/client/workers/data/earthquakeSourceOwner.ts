import {
  EARTHQUAKE_SOURCE_POLICY,
  fetchEarthquakes,
  parseEarthquakeCacheSnapshot,
  type EarthquakeCacheSnapshot,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";

export type EarthquakeSourceOwnerDependencies = Readonly<{
  readCache: () => Promise<unknown | null>;
  persistCache: (snapshot: EarthquakeCacheSnapshot) => void;
  fetchPoints?: () => Promise<EarthquakePoint[]>;
  publish: (snapshot: DataWorkerSourceSnapshot) => void;
  rebaseRender: (points: readonly EarthquakePoint[]) => void;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => () => void;
}>;

export type EarthquakeSourceOwner = Readonly<{
  start: () => Promise<void>;
  refresh: () => Promise<void>;
  rebase: () => void;
  snapshot: () => DataWorkerSourceSnapshot;
  read: () => readonly EarthquakePoint[];
  find: (id: string) => EarthquakePoint | null;
}>;

const INITIAL_SNAPSHOT: DataWorkerSourceSnapshot = {
  source: "earthquake",
  version: 0,
  status: "loading",
  loading: true,
  count: 0,
  lastUpdatedAt: null,
  error: null,
};

export function createEarthquakeSourceOwner(
  dependencies: EarthquakeSourceOwnerDependencies,
): EarthquakeSourceOwner {
  const now = dependencies.now ?? Date.now;
  const fetchPoints = dependencies.fetchPoints ?? fetchEarthquakes;
  const schedule =
    dependencies.schedule ??
    ((callback: () => void, delayMs: number) => {
      const handle = setTimeout(callback, delayMs);
      return () => clearTimeout(handle);
    });
  let snapshot = INITIAL_SNAPSHOT;
  let points: readonly EarthquakePoint[] = [];
  let pointsById = new Map<string, EarthquakePoint>();
  let startInFlight: Promise<void> | null = null;
  let startupComplete = false;
  let refreshInFlight: Promise<void> | null = null;
  let cancelScheduledRefresh: (() => void) | null = null;

  const publish = (
    update: Omit<DataWorkerSourceSnapshot, "source" | "version">,
  ): void => {
    snapshot = {
      source: "earthquake",
      ...update,
      version: snapshot.version + 1,
    };
    dependencies.publish(snapshot);
  };

  const replace = (nextPoints: readonly EarthquakePoint[]): void => {
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

  const accept = (
    nextPoints: EarthquakePoint[],
    receivedAt: number,
  ): void => {
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
      error instanceof Error ? error.message : "USGS refresh failed";
    const lastUpdatedAt = snapshot.lastUpdatedAt;
    if (points.length > 0) {
      publish({
        status: "cached",
        loading: false,
        count: points.length,
        lastUpdatedAt,
        error: message,
      });
      return;
    }
    publish({
      status: "error",
      loading: false,
      count: 0,
      lastUpdatedAt,
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
      accept(await fetchPoints(), now());
      scheduleRefresh(EARTHQUAKE_SOURCE_POLICY.pollIntervalMs);
    } catch (error) {
      retainAfterFailure(error);
      scheduleRefresh(EARTHQUAKE_SOURCE_POLICY.retryIntervalMs);
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
      const cached = parseEarthquakeCacheSnapshot(
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
    read(): readonly EarthquakePoint[] {
      return points;
    },
    find(id): EarthquakePoint | null {
      return pointsById.get(id) ?? null;
    },
  };
}
