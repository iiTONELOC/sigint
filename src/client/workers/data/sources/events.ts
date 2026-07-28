import {
  parseEventCache,
  type EventPoint,
} from "@/features/intel/events/data/codec";
import { fetchEventSnapshot } from "@/features/intel/events/data/fetch";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import {
  createPointSourceRuntime,
  type PointSourceCacheSnapshot,
  type PointSourceFetchSnapshot,
  type PointSourceRuntime,
} from "@/workers/data/sourceRuntime";

export const EVENT_SOURCE = getPointSourceDefinition("events");

/** GDELT keeps a rolling window rather than a live snapshot. */
export const EVENT_WINDOW_MS = 7 * 24 * 60 * 60_000;

export type EventSourceRuntime = PointSourceRuntime<EventPoint>;

export type EventSourceRuntimeOptions = Readonly<{
  readCache: () => Promise<unknown>;
  persistCache: (
    snapshot: PointSourceCacheSnapshot<EventPoint>,
  ) => Promise<void> | void;
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<EventPoint>>;
  publishStatus: (status: DataWorkerSourceSnapshot) => void;
  now?: () => number;
}>;

function publishedAt(point: EventPoint): number {
  const parsed = point.timestamp ? Date.parse(point.timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventChanged(previous: EventPoint, next: EventPoint): boolean {
  return (
    previous.lat !== next.lat ||
    previous.lon !== next.lon ||
    previous.timestamp !== next.timestamp ||
    previous.data.severity !== next.data.severity ||
    previous.data.headline !== next.data.headline
  );
}

/**
 * Each poll returns only the newest export, so the window is rebuilt here:
 * retained entries inside the window plus the incoming batch, published as a
 * complete snapshot. That is what drops anything older than the window,
 * which a partial snapshot alone would never do.
 */
export function mergeEventWindow(
  retained: readonly EventPoint[],
  incoming: readonly EventPoint[],
  now: number,
): EventPoint[] {
  const cutoff = now - EVENT_WINDOW_MS;
  const byId = new Map<string, EventPoint>();
  for (const point of retained) {
    if (publishedAt(point) >= cutoff) byId.set(point.id, point);
  }
  for (const point of incoming) byId.set(point.id, point);
  return [...byId.values()];
}

export function createEventSourceRuntime(
  options: EventSourceRuntimeOptions,
): EventSourceRuntime {
  const now = options.now ?? Date.now;
  // Assigned immediately after the runtime exists; only read inside the
  // fetch callback, which cannot run before then.
  const retained = { values: (): readonly EventPoint[] => [] };

  const fetchWindow = async (): Promise<
    PointSourceFetchSnapshot<EventPoint>
  > => {
    const snapshot = options.fetchSnapshot
      ? await options.fetchSnapshot()
      : await fetchEventSnapshot(now);
    return {
      completeness: "complete",
      entities: mergeEventWindow(
        retained.values(),
        snapshot.entities,
        snapshot.observedAt,
      ),
      observedAt: snapshot.observedAt,
    };
  };

  const runtime = createPointSourceRuntime<EventPoint>({
    id: EVENT_SOURCE.id,
    cacheKey: EVENT_SOURCE.cacheKey,
    pollIntervalMs: EVENT_SOURCE.pollIntervalMs,
    maxQueryItems: POINT_UI_QUERY_POLICY.datasetQueryLimit,
    hasChanged: eventChanged,
    readCache: options.readCache,
    parseCache: parseEventCache,
    persistCache: options.persistCache,
    fetchSnapshot: fetchWindow,
    publishStatus: options.publishStatus,
    publishPatch: () => {},
  });
  retained.values = runtime.values;
  return runtime;
}
