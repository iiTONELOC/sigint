import { CacheKey } from "@shared/domain/cache";
import {
  TRAIL_POLICY,
  mergeCachedTrails,
  parseTrailEntry,
  recordTrailPositions,
  type TrackSource,
  type TrailEntry,
  type TrailObservation,
  type TrailPoint,
} from "@/lib/geo/trails/trailStore";
import { isRecord } from "@shared/geo";
import { MS_PER_SECOND } from "@shared/time";

export const TRAIL_RECORDER_POLICY: Readonly<{
  cacheKey: CacheKey.Trails;
  persistIntervalMs: number;
}> = {
  cacheKey: CacheKey.Trails,
  persistIntervalMs: 10 * MS_PER_SECOND,
};

export type TrailRecorderOptions = Readonly<{
  readCache: () => Promise<unknown>;
  persistCache: (value: Readonly<Record<string, TrailEntry>>) => void;
  now?: () => number;
}>;

export type TrailRecorder = Readonly<{
  hydrate: () => Promise<void>;
  observe: (
    source: TrackSource,
    observations: readonly TrailObservation[],
  ) => void;
  get: (id: string) => TrailEntry | null;
  lastPoint: (
    source: TrackSource,
    id: string,
  ) => TrailPoint | null;
  subscribe: (
    listener: (source: TrackSource) => void,
  ) => () => void;
}>;

function parseCache(value: unknown): Map<string, TrailEntry> {
  const map = new Map<string, TrailEntry>();
  if (!isRecord(value)) return map;
  for (const [id, entry] of Object.entries(value)) {
    const parsed = parseTrailEntry(entry);
    if (parsed) map.set(id, parsed);
  }
  return map;
}

export function createTrailRecorder(
  options: TrailRecorderOptions,
): TrailRecorder {
  const now = options.now ?? Date.now;
  const trails = new Map<string, TrailEntry>();
  const listeners = new Set<(source: TrackSource) => void>();
  let hydrated = false;
  let lastPersist = 0;

  const persist = (at: number): void => {
    // Persisting before hydrate would write the shallow boot state over the
    // cached history that hydrate is about to merge in.
    if (!hydrated || at - lastPersist <= TRAIL_RECORDER_POLICY.persistIntervalMs) {
      return;
    }
    lastPersist = at;
    options.persistCache(Object.fromEntries(trails));
  };

  return {
    async hydrate(): Promise<void> {
      if (hydrated) return;
      const cached = parseCache(await options.readCache());
      const at = now();
      for (const [id, entry] of cached) {
        if (at - entry.lastSeen > TRAIL_POLICY[entry.type].staleMs) {
          cached.delete(id);
        }
      }
      mergeCachedTrails(trails, cached);
      hydrated = true;
      const hydratedSources = new Set(
        Array.from(cached.values(), (entry) => entry.type),
      );
      for (const source of hydratedSources) {
        for (const listener of listeners) listener(source);
      }
    },

    observe(
      source: TrackSource,
      observations: readonly TrailObservation[],
    ): void {
      const at = now();
      if (!recordTrailPositions(trails, source, observations, at)) return;
      persist(at);
      for (const listener of listeners) listener(source);
    },

    get(id: string): TrailEntry | null {
      return trails.get(id) ?? null;
    },

    lastPoint(source: TrackSource, id: string): TrailPoint | null {
      const entry = trails.get(id);
      if (entry?.type !== source) return null;
      return entry.points.at(-1) ?? null;
    },

    subscribe(listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
