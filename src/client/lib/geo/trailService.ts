import { cacheGet, cacheSetDeferred } from "@/lib/cache/storageService";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";

const CACHE_KEY = CACHE_KEYS.trails;
const PERSIST_INTERVAL_MS = 10_000;

export type TrackType = "aircraft" | "ships";

type TrailPolicy = Readonly<{
  minMoveDeg: number;
  maxTrailPoints: number;
  staleMs: number;
  maxExtrapolationMs: number;
}>;

export const TRAIL_POLICY: Readonly<Record<
  TrackType,
  TrailPolicy
>> = {
  aircraft: {
    minMoveDeg: 0.001,
    maxTrailPoints: 120,
    staleMs: 900_000,
    maxExtrapolationMs: 600_000,
  },
  ships: {
    minMoveDeg: 0.0002,
    maxTrailPoints: 500,
    staleMs: 3_600_000,
    maxExtrapolationMs: 1_800_000,
  },
};

function legacyTrackType(id: string): TrackType {
  // Old cache entries lacked an owner discriminator.
  return id.startsWith("S") ? "ships" : "aircraft";
}

export type TrailPoint = {
  lat: number;
  lon: number;
  ts: number;
  altitude?: number;
  speed?: number;
  heading?: number;
};

export type TrailEntry = {
  type: TrackType;
  points: TrailPoint[];
  lastSeen: number;
  heading: number;
  speedMps: number;
};

export type TrailObservation = {
  id: string;
  lat: number;
  lon: number;
  observedAt: number;
  heading?: number;
  speedMps?: number;
  altitude?: number;
  speed?: number;
};

let trails = new Map<string, TrailEntry>();
let lastPersist = 0;
let loaded = false;

// ── Cache ────────────────────────────────────────────────────────────

type CachedTrailEntry = Omit<TrailEntry, "type"> & {
  type?: TrackType;
  missedRefreshes?: number;
};

async function readCache(): Promise<Map<string, TrailEntry>> {
  const cached = await cacheGet<Record<string, CachedTrailEntry>>(CACHE_KEY);
  if (!cached) return new Map();
  const map = new Map<string, TrailEntry>();
  for (const [id, entry] of Object.entries(cached)) {
    if (Array.isArray(entry.points) && entry.points.length > 0) {
      map.set(id, {
        type: entry.type ?? legacyTrackType(id),
        points: entry.points,
        lastSeen: entry.lastSeen,
        heading: entry.heading,
        speedMps: entry.speedMps,
      });
    }
  }
  return map;
}

function writeCache(): void {
  // Critical: do NOT persist before `initTrails` has merged any cached
  // history into the live Map. If we wrote the shallow boot-time
  // trails here first, the merge in initTrails would either lose
  // history (if it ran after this write) or re-read what we just
  // wrote. Persistence is paused until `loaded === true`.
  if (!loaded) return;
  const obj: Record<string, TrailEntry> = {};
  for (const [id, entry] of trails) {
    obj[id] = entry;
  }
  cacheSetDeferred(CACHE_KEY, obj);
}

function maybePersist(now: number): void {
  if (!loaded || now - lastPersist <= PERSIST_INTERVAL_MS) return;
  writeCache();
  lastPersist = now;
}

/** Preserve live boot observations while restoring older cached history. */
export function mergeCachedTrails(
  live: Map<string, TrailEntry>,
  cached: Map<string, TrailEntry>,
): void {
  for (const [id, cachedEntry] of cached) {
    const liveEntry = live.get(id);
    if (!liveEntry || liveEntry.points.length === 0) {
      live.set(id, cachedEntry);
      continue;
    }
    if (liveEntry.type !== cachedEntry.type) continue;
    const earliestLiveTs = liveEntry.points[0]!.ts;
    const history: TrailPoint[] = [];
    for (const point of cachedEntry.points) {
      if (point.ts < earliestLiveTs) history.push(point);
    }
    if (history.length === 0) continue;
    const maxPoints = TRAIL_POLICY[liveEntry.type].maxTrailPoints;
    const combined = [...history, ...liveEntry.points];
    liveEntry.points =
      combined.length > maxPoints
        ? combined.slice(-maxPoints)
        : combined;
  }
}

/** Restore non-stale cached trails once at boot. */
export async function initTrails(): Promise<void> {
  if (loaded) return;
  const cached = await readCache();
  const now = Date.now();
  for (const [id, entry] of cached) {
    if (now - entry.lastSeen > TRAIL_POLICY[entry.type].staleMs) {
      cached.delete(id);
    }
  }
  mergeCachedTrails(trails, cached);
  loaded = true;
}

// ── Earth math ───────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const EARTH_R = 6_371_000;
const MS_PER_SECOND = 1_000;
const MIN_EXTRAPOLATION_MS = MS_PER_SECOND;

function movePoint(
  lat: number,
  lon: number,
  headingDeg: number,
  distMeters: number,
): { lat: number; lon: number } {
  const hdg = headingDeg * DEG;
  const dLat = (distMeters * Math.cos(hdg)) / EARTH_R / DEG;
  const dLon =
    (distMeters * Math.sin(hdg)) / (EARTH_R * Math.cos(lat * DEG)) / DEG;
  return { lat: lat + dLat, lon: lon + dLon };
}

// ── Public API ───────────────────────────────────────────────────────

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function isUsableObservation(item: TrailObservation): boolean {
  return (
    item.id.length > 0 &&
    Number.isFinite(item.lat) &&
    Number.isFinite(item.lon) &&
    Number.isFinite(item.observedAt)
  );
}

export function recordTrailPositions(
  target: Map<string, TrailEntry>,
  source: TrackType,
  items: readonly TrailObservation[],
  now: number,
): boolean {
  const policy = TRAIL_POLICY[source];
  let changed = false;

  for (const item of items) {
    if (!isUsableObservation(item)) continue;
    const observedAt = Math.min(item.observedAt, now);
    if (now - observedAt > policy.staleMs) continue;

    const existing = target.get(item.id);
    const entry =
      existing?.type === source
        ? existing
        : undefined;
    if (entry && observedAt <= entry.lastSeen) continue;

    if (!entry) {
      target.set(item.id, {
        type: source,
        points: [{
          lat: item.lat,
          lon: item.lon,
          ts: observedAt,
          altitude: item.altitude,
          speed: item.speed,
          heading: item.heading,
        }],
        lastSeen: observedAt,
        heading: finiteOr(item.heading, 0),
        speedMps: finiteOr(item.speedMps, 0),
      });
      changed = true;
      continue;
    }

    const last = entry.points.at(-1);
    if (
      !last ||
      Math.abs(last.lat - item.lat) >= policy.minMoveDeg ||
      Math.abs(last.lon - item.lon) >= policy.minMoveDeg
    ) {
      entry.points.push({
        lat: item.lat,
        lon: item.lon,
        ts: observedAt,
        altitude: item.altitude,
        speed: item.speed,
        heading: item.heading,
      });
      if (entry.points.length > policy.maxTrailPoints) {
        entry.points = entry.points.slice(-policy.maxTrailPoints);
      }
    }
    entry.lastSeen = observedAt;
    entry.heading = finiteOr(item.heading, entry.heading);
    entry.speedMps = finiteOr(item.speedMps, entry.speedMps);
    changed = true;
  }

  for (const [id, entry] of target) {
    if (
      entry.type === source &&
      now - entry.lastSeen > policy.staleMs
    ) {
      target.delete(id);
      changed = true;
    }
  }

  return changed;
}

export function recordPositions(
  source: TrackType,
  items: readonly TrailObservation[],
  now = Date.now(),
): void {
  if (!recordTrailPositions(trails, source, items, now)) return;
  maybePersist(now);
}

/**
 * Get the recorded trail for an item.
 */
export function getTrail(id: string): TrailPoint[] {
  return trails.get(id)?.points ?? [];
}

/**
 * Get interpolated position based on last known position + speed + heading.
 * Returns null if no data or speed is zero.
 */
export function getInterpolatedPosition(
  id: string,
): { lat: number; lon: number } | null {
  const entry = trails.get(id);
  if (!entry || entry.points.length === 0) return null;
  if (entry.speedMps <= 0) return null;

  const last = entry.points[entry.points.length - 1]!;
  const elapsedMs = Date.now() - last.ts;
  if (elapsedMs > TRAIL_POLICY[entry.type].maxExtrapolationMs) return null;
  if (elapsedMs < MIN_EXTRAPOLATION_MS) return null;

  return movePoint(
    last.lat,
    last.lon,
    entry.heading,
    entry.speedMps * (elapsedMs / MS_PER_SECOND),
  );
}

/**
 * Check if we have motion data for an item (speed > 0).
 */
export function hasMotionData(id: string): boolean {
  const entry = trails.get(id);
  return !!entry && entry.speedMps > 0;
}
