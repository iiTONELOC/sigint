import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import {
  interpolatePosition,
  trackMotion,
  type TrackMotion,
  type TrailEntry,
  type TrailPoint,
} from "@/lib/geo/trails/trailStore";

export type {
  TrackMotion,
  TrackType,
  TrailEntry,
  TrailObservation,
  TrailPoint,
} from "@/lib/geo/trails/trailStore";
export { TRAIL_POLICY } from "@/lib/geo/trails/trailStore";

// ── Watched track ────────────────────────────────────────────────────
// The DataWorker records every track's history. The main thread only ever
// draws one at a time (the selected item's polyline, the tracked item's
// dead-reckoned position), so it mirrors exactly that one entry. Reads stay
// synchronous because the render and camera paths call them per frame, and
// subscribers are notified when a reply lands so a caller that built a
// command from an empty mirror can rebuild it.

const EMPTY_TRAIL: readonly TrailPoint[] = [];

export type TrailReader = Readonly<{
  getTrail: (id: string) => Promise<TrailEntry | null>;
}>;

export type TrailMirror = Readonly<{
  watch: (id: string | null) => void;
  subscribe: (listener: () => void) => () => void;
  revision: () => number;
  trail: (id: string) => readonly TrailPoint[];
  interpolatedPosition: (id: string) => { lat: number; lon: number } | null;
  motion: (id: string) => TrackMotion | null;
}>;

/**
 * The reader is injected so a caller can drive the mirror without reaching
 * for the worker singleton, which a process-wide module mock would otherwise
 * replace for every other consumer in the same run.
 */
export function createTrailMirror(
  readReader: () => TrailReader | null,
  now: () => number = Date.now,
): TrailMirror {
  let watchedId: string | null = null;
  let watchedEntry: TrailEntry | null = null;
  let revision = 0;
  let inFlight = 0;
  const listeners = new Set<() => void>();

  const publish = (): void => {
    revision += 1;
    for (const listener of listeners) listener();
  };

  const entryFor = (id: string): TrailEntry | null =>
    id === watchedId ? watchedEntry : null;

  return {
    watch(id: string | null): void {
      if (id !== watchedId) {
        watchedId = id;
        watchedEntry = null;
        publish();
      }
      if (id === null) return;

      const reader = readReader();
      if (!reader) return;

      const request = ++inFlight;
      void reader
        .getTrail(id)
        .then((entry) => {
          if (request !== inFlight || id !== watchedId) return;
          watchedEntry = entry;
          publish();
        })
        .catch((error_: unknown) => undefined);
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    revision: () => revision,

    trail: (id: string) => entryFor(id)?.points ?? EMPTY_TRAIL,

    interpolatedPosition(id: string) {
      const entry = entryFor(id);
      return entry ? interpolatePosition(entry, now()) : null;
    },

    motion(id: string) {
      const entry = entryFor(id);
      return entry ? trackMotion(entry) : null;
    },
  };
}

const watchedTrail = createTrailMirror(getDataWorkerClient);

/**
 * Point the mirror at a track and pull its history. Safe to call on every
 * selection change and on every source update; replies for a track that is
 * no longer watched are discarded.
 */
export function watchTrail(id: string | null): void {
  watchedTrail.watch(id);
}

/** Fires whenever the watched track changes or its history arrives. */
export function subscribeWatchedTrail(listener: () => void): () => void {
  return watchedTrail.subscribe(listener);
}

/** Monotonic counter identifying the mirror's current contents. */
export function watchedTrailRevision(): number {
  return watchedTrail.revision();
}

/** Recorded history for a track. Empty unless it is the watched one. */
export function getTrail(id: string): readonly TrailPoint[] {
  return watchedTrail.trail(id);
}

/**
 * Dead-reckoned position from the last fix. Null when the track is not
 * watched, is stationary, or has drifted past its extrapolation window.
 */
export function getInterpolatedPosition(
  id: string,
): { lat: number; lon: number } | null {
  return watchedTrail.interpolatedPosition(id);
}

/**
 * The renderer dead-reckons only the selected track, so its motion rides the
 * presentation command rather than a per-poll broadcast of every track.
 */
export function getTrackMotion(id: string): TrackMotion | null {
  return watchedTrail.motion(id);
}
