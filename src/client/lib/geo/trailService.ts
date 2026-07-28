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
// synchronous because the render and camera paths call them per frame.

const EMPTY_TRAIL: readonly TrailPoint[] = [];

let watchedId: string | null = null;
let watchedEntry: TrailEntry | null = null;
let inFlight = 0;

/**
 * Point the mirror at a track and pull its history. Safe to call on every
 * selection change and on every source update; replies for a track that is
 * no longer watched are discarded.
 */
export function watchTrail(id: string | null): void {
  if (id !== watchedId) {
    watchedId = id;
    watchedEntry = null;
  }
  if (id === null) return;

  const client = getDataWorkerClient();
  if (!client) return;

  const request = ++inFlight;
  void client
    .getTrail(id)
    .then((entry) => {
      if (request !== inFlight || id !== watchedId) return;
      watchedEntry = entry;
    })
    .catch(() => {});
}

function entryFor(id: string): TrailEntry | null {
  return id === watchedId ? watchedEntry : null;
}

/** Recorded history for a track. Empty unless it is the watched one. */
export function getTrail(id: string): readonly TrailPoint[] {
  return entryFor(id)?.points ?? EMPTY_TRAIL;
}

/**
 * Dead-reckoned position from the last fix. Null when the track is not
 * watched, is stationary, or has drifted past its extrapolation window.
 */
export function getInterpolatedPosition(
  id: string,
): { lat: number; lon: number } | null {
  const entry = entryFor(id);
  return entry ? interpolatePosition(entry, Date.now()) : null;
}

/**
 * The renderer dead-reckons only the selected track, so its motion rides the
 * presentation command rather than a per-poll broadcast of every track.
 */
export function getTrackMotion(id: string): TrackMotion | null {
  const entry = entryFor(id);
  return entry ? trackMotion(entry) : null;
}
