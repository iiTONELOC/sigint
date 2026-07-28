import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import {
  TRAIL_POLICY,
  mergeCachedTrails,
  parseTrailEntry,
  recordTrailPositions,
  type TrackType,
  type TrailEntry,
  type TrailObservation,
} from "@/lib/geo/trails/trailStore";
import { isRecord } from "@shared/geo";

export const TRAIL_RECORDER_POLICY = {
  cacheKey: CACHE_KEYS.trails,
  persistIntervalMs: 10_000,
} as const;

export type TrailRecorderOptions = Readonly<{
  readCache: () => Promise<unknown>;
  persistCache: (value: Readonly<Record<string, TrailEntry>>) => void;
  now?: () => number;
}>;

export type TrailRecorder = Readonly<{
  hydrate: () => Promise<void>;
  observe: (
    source: TrackType,
    observations: readonly TrailObservation[],
  ) => void;
  get: (id: string) => TrailEntry | null;
}>;

function parseCache(value: unknown): Map<string, TrailEntry> {
  const map = new Map<string, TrailEntry>();
  if (!isRecord(value)) return map;
  for (const [id, entry] of Object.entries(value)) {
    const parsed = parseTrailEntry(id, entry);
    if (parsed) map.set(id, parsed);
  }
  return map;
}

export function createTrailRecorder(
  options: TrailRecorderOptions,
): TrailRecorder {
  const now = options.now ?? Date.now;
  const trails = new Map<string, TrailEntry>();
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
    },

    observe(
      source: TrackType,
      observations: readonly TrailObservation[],
    ): void {
      const at = now();
      if (!recordTrailPositions(trails, source, observations, at)) return;
      persist(at);
    },

    get(id: string): TrailEntry | null {
      return trails.get(id) ?? null;
    },
  };
}
