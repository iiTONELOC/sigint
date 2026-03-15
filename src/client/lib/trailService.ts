import { cacheGet, cacheSet } from "@/lib/storageService";

const CACHE_KEY = "sigint.trails.v1";
const MIN_MOVE_DEG = 0.001; // ~100m — skip if hasn't moved
const PERSIST_INTERVAL_MS = 30_000;
const MAX_MISSED_REFRESHES = 3;
const MAX_TRAIL_POINTS = 50; // ~3.3 hours at 4-min intervals

export type TrailPoint = {
  lat: number;
  lon: number;
  ts: number;
  altitude?: number;
  speed?: number;
  heading?: number;
};

type TrailEntry = {
  points: TrailPoint[];
  lastSeen: number;
  missedRefreshes: number;
  heading: number;
  speedMps: number;
};

let trails = new Map<string, TrailEntry>();
let lastPersist = 0;
let loaded = false;

// ── Cache ────────────────────────────────────────────────────────────

function readCache(): Map<string, TrailEntry> {
  const cached = cacheGet<Record<string, TrailEntry>>(CACHE_KEY);
  if (!cached) return new Map();
  const map = new Map<string, TrailEntry>();
  for (const [id, entry] of Object.entries(cached)) {
    if (Array.isArray(entry.points) && entry.points.length > 0) {
      map.set(id, entry);
    }
  }
  return map;
}

function writeCache(): void {
  const obj: Record<string, TrailEntry> = {};
  for (const [id, entry] of trails) {
    obj[id] = entry;
  }
  cacheSet(CACHE_KEY, obj);
}

function maybePersist(): void {
  const now = Date.now();
  if (now - lastPersist > PERSIST_INTERVAL_MS) {
    writeCache();
    lastPersist = now;
  }
}

function ensureLoaded(): void {
  if (!loaded) {
    const cached = readCache();
    if (cached.size > 0) trails = cached;
    loaded = true;
  }
}

// ── Earth math ───────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const EARTH_R = 6_371_000;

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

/**
 * Record positions for all moving items after a data refresh.
 */
export function recordPositions(
  items: Array<{
    id: string;
    lat: number;
    lon: number;
    heading?: number;
    speedMps?: number;
    altitude?: number;
    speed?: number;
  }>,
): void {
  ensureLoaded();
  const now = Date.now();
  const seenIds = new Set<string>();

  for (const item of items) {
    seenIds.add(item.id);
    const entry = trails.get(item.id);

    if (entry) {
      const last = entry.points[entry.points.length - 1];
      if (
        !last ||
        Math.abs(last.lat - item.lat) >= MIN_MOVE_DEG ||
        Math.abs(last.lon - item.lon) >= MIN_MOVE_DEG
      ) {
        entry.points.push({
          lat: item.lat,
          lon: item.lon,
          ts: now,
          altitude: item.altitude,
          speed: item.speed,
          heading: item.heading,
        });
        if (entry.points.length > MAX_TRAIL_POINTS) {
          entry.points = entry.points.slice(-MAX_TRAIL_POINTS);
        }
      }
      entry.lastSeen = now;
      entry.missedRefreshes = 0;
      entry.heading = item.heading ?? entry.heading;
      entry.speedMps = item.speedMps ?? entry.speedMps;
    } else {
      trails.set(item.id, {
        points: [
          {
            lat: item.lat,
            lon: item.lon,
            ts: now,
            altitude: item.altitude,
            speed: item.speed,
            heading: item.heading,
          },
        ],
        lastSeen: now,
        missedRefreshes: 0,
        heading: item.heading ?? 0,
        speedMps: item.speedMps ?? 0,
      });
    }
  }

  for (const [id, entry] of trails) {
    if (!seenIds.has(id)) {
      entry.missedRefreshes++;
      if (entry.missedRefreshes > MAX_MISSED_REFRESHES) {
        trails.delete(id);
      }
    }
  }

  maybePersist();
}

/**
 * Get the recorded trail for an item.
 */
export function getTrail(id: string): TrailPoint[] {
  ensureLoaded();
  return trails.get(id)?.points ?? [];
}

/**
 * Get interpolated position based on last known position + speed + heading.
 * Returns null if no data or speed is zero.
 */
export function getInterpolatedPosition(
  id: string,
): { lat: number; lon: number } | null {
  ensureLoaded();
  const entry = trails.get(id);
  if (!entry || entry.points.length === 0) return null;
  if (entry.speedMps <= 0) return null;

  const last = entry.points[entry.points.length - 1]!;
  const elapsed = (Date.now() - last.ts) / 1000;

  // Don't extrapolate beyond 10 min — data is stale
  if (elapsed > 600) return null;
  // Don't bother for tiny elapsed times
  if (elapsed < 1) return null;

  return movePoint(last.lat, last.lon, entry.heading, entry.speedMps * elapsed);
}

/**
 * Check if we have motion data for an item (speed > 0).
 */
export function hasMotionData(id: string): boolean {
  ensureLoaded();
  const entry = trails.get(id);
  return !!entry && entry.speedMps > 0;
}
