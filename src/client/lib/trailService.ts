import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

const CACHE_KEY = CACHE_KEYS.trails;
const PERSIST_INTERVAL_MS = 10_000;

// ── Type-aware settings ──────────────────────────────────────────────

type TrackType = "aircraft" | "ships";

const SETTINGS: Record<
  TrackType,
  {
    minMoveDeg: number;
    maxTrailPoints: number;
    maxMissedRefreshes: number;
    missThresholdMs: number;
  }
> = {
  aircraft: {
    minMoveDeg: 0.001, // ~100m
    maxTrailPoints: 50, // ~3.3 hours at 4-min intervals
    maxMissedRefreshes: 8, // ~32 min
    missThresholdMs: 180_000, // 3 min — one poll interval
  },
  ships: {
    minMoveDeg: 0.0002, // ~22m — ships move slowly
    maxTrailPoints: 500, // days of history at slow poll rates
    maxMissedRefreshes: 60, // ~1 hour at ~1-min AIS intervals
    missThresholdMs: 300_000, // 5 min — AIS can be bursty
  },
};

function getSettings(id: string) {
  // IDs: aircraft = A{icao24}, ships = S{mmsi}
  if (id.startsWith("S")) return SETTINGS.ships;
  return SETTINGS.aircraft;
}

// ── Types ────────────────────────────────────────────────────────────

export type TrailPoint = {
  lat: number;
  lon: number;
  ts: number;
  altitude?: number;
  speed?: number;
  heading?: number;
};

export type TrailEntry = {
  points: TrailPoint[];
  lastSeen: number;
  missedRefreshes: number;
  heading: number;
  speedMps: number;
};

let trails = new Map<string, TrailEntry>();
let lastPersist = 0;
let loaded = false;
// Bumped whenever positions are recorded. The globe syncs trail state to the
// render worker only when this changes — between polls it's stable, so the
// per-frame loop skips the (heavy) re-clone of every track.
let trailsRev = 0;

export function getTrailsRev(): number {
  return trailsRev;
}

// ── Cache ────────────────────────────────────────────────────────────

async function readCache(): Promise<Map<string, TrailEntry>> {
  const cached = await cacheGet<Record<string, TrailEntry>>(CACHE_KEY);
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
  cacheSet(CACHE_KEY, obj);
}

function maybePersist(): void {
  if (!loaded) return;
  const now = Date.now();
  if (now - lastPersist > PERSIST_INTERVAL_MS) {
    writeCache();
    lastPersist = now;
  }
}

/** Merge cached trail history into the live trails Map.
 *
 *  This fixes a boot race: `recordPositions` runs from the DataContext
 *  useEffect as soon as providers hydrate, but `initTrails()` is fired
 *  non-blocking from frontend.tsx. If recordPositions had already
 *  populated entries in the live Map by the time initTrails finished
 *  reading IDB, the old behavior (`trails = cached`) silently dropped
 *  those just-recorded points.
 *
 *  New contract: for each cached entry, prepend the cached points that
 *  are older than the earliest live point, then re-apply the per-type
 *  maxTrailPoints cap. Entries unique to cached are installed wholesale
 *  (their aircraft may reappear in a later poll). Pure — no module
 *  state access, no I/O. Testable as a Map → Map transformation. */
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
    const earliestLiveTs = liveEntry.points[0]!.ts;
    const history: TrailPoint[] = [];
    for (const p of cachedEntry.points) {
      if (p.ts < earliestLiveTs) history.push(p);
    }
    if (history.length === 0) continue;
    const cfg = getSettings(id);
    const combined = [...history, ...liveEntry.points];
    liveEntry.points =
      combined.length > cfg.maxTrailPoints
        ? combined.slice(-cfg.maxTrailPoints)
        : combined;
  }
}

/** Call once at boot to load trails from IndexedDB.
 *
 *  Merges into the live `trails` Map rather than replacing it — see
 *  `mergeCachedTrails` for the rationale. */
export async function initTrails(): Promise<void> {
  if (loaded) return;
  const cached = await readCache();
  mergeCachedTrails(trails, cached);
  loaded = true;
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
    type?: "aircraft" | "ships";
    lat: number;
    lon: number;
    heading?: number;
    speedMps?: number;
    altitude?: number;
    speed?: number;
  }>,
): void {
  const now = Date.now();
  const seenIds = new Set<string>();

  for (const item of items) {
    seenIds.add(item.id);
    const cfg = getSettings(item.id);
    const entry = trails.get(item.id);

    if (entry) {
      const last = entry.points[entry.points.length - 1];
      if (
        !last ||
        Math.abs(last.lat - item.lat) >= cfg.minMoveDeg ||
        Math.abs(last.lon - item.lon) >= cfg.minMoveDeg
      ) {
        entry.points.push({
          lat: item.lat,
          lon: item.lon,
          ts: now,
          altitude: item.altitude,
          speed: item.speed,
          heading: item.heading,
        });
        if (entry.points.length > cfg.maxTrailPoints) {
          entry.points = entry.points.slice(-cfg.maxTrailPoints);
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

  // Prune tracks that haven't been seen — type-aware thresholds
  for (const [id, entry] of trails) {
    if (!seenIds.has(id)) {
      const cfg = getSettings(id);
      if (now - entry.lastSeen > cfg.missThresholdMs) {
        entry.missedRefreshes++;
        if (entry.missedRefreshes > cfg.maxMissedRefreshes) {
          trails.delete(id);
        }
      }
    }
  }

  trailsRev++;
  maybePersist();
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
  const elapsed = (Date.now() - last.ts) / 1000;

  // Ships: extrapolate up to 30 min (they move slowly, AIS gaps are common)
  // Aircraft: extrapolate up to 10 min
  const maxExtrapolate = id.startsWith("S") ? 1800 : 600;
  if (elapsed > maxExtrapolate) return null;
  if (elapsed < 1) return null;

  return movePoint(last.lat, last.lon, entry.heading, entry.speedMps * elapsed);
}

/**
 * Check if we have motion data for an item (speed > 0).
 */
export function hasMotionData(id: string): boolean {
  const entry = trails.get(id);
  return !!entry && entry.speedMps > 0;
}
