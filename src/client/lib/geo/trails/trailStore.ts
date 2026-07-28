import { isRecord } from "@shared/geo";

export type TrackType = "aircraft" | "ships";

type TrailPolicy = Readonly<{
  minMoveDeg: number;
  maxTrailPoints: number;
  staleMs: number;
  maxExtrapolationMs: number;
}>;

export const TRAIL_POLICY: Readonly<Record<TrackType, TrailPolicy>> = {
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

export function legacyTrackType(id: string): TrackType {
  // Old cache entries lacked an owner discriminator.
  return id.startsWith("S") ? "ships" : "aircraft";
}

// ── Parse ────────────────────────────────────────────────────────────

function isTrailPointArray(value: unknown): value is TrailPoint[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (point: unknown) =>
        isRecord(point) &&
        typeof point.lat === "number" &&
        typeof point.lon === "number" &&
        typeof point.ts === "number",
    )
  );
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

/**
 * One validator for both the persisted cache and the worker reply. `id` only
 * supplies the track type for cache entries written before it was recorded.
 */
export function parseTrailEntry(
  id: string,
  value: unknown,
): TrailEntry | null {
  if (!isRecord(value) || !isTrailPointArray(value.points)) return null;
  return {
    type:
      value.type === "aircraft" || value.type === "ships"
        ? value.type
        : legacyTrackType(id),
    points: value.points,
    lastSeen: numberOr(value.lastSeen, 0),
    heading: numberOr(value.heading, 0),
    speedMps: numberOr(value.speedMps, 0),
  };
}

// ── Merge ────────────────────────────────────────────────────────────

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

// ── Record ───────────────────────────────────────────────────────────

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

function trailPoint(item: TrailObservation, ts: number): TrailPoint {
  return {
    lat: item.lat,
    lon: item.lon,
    ts,
    altitude: item.altitude,
    speed: item.speed,
    heading: item.heading,
  };
}

function newEntry(
  source: TrackType,
  item: TrailObservation,
  observedAt: number,
): TrailEntry {
  return {
    type: source,
    points: [trailPoint(item, observedAt)],
    lastSeen: observedAt,
    heading: finiteOr(item.heading, 0),
    speedMps: finiteOr(item.speedMps, 0),
  };
}

function hasMoved(
  entry: TrailEntry,
  item: TrailObservation,
  policy: TrailPolicy,
): boolean {
  const last = entry.points.at(-1);
  return (
    !last ||
    Math.abs(last.lat - item.lat) >= policy.minMoveDeg ||
    Math.abs(last.lon - item.lon) >= policy.minMoveDeg
  );
}

function extendEntry(
  entry: TrailEntry,
  item: TrailObservation,
  observedAt: number,
  policy: TrailPolicy,
): void {
  if (hasMoved(entry, item, policy)) {
    entry.points.push(trailPoint(item, observedAt));
    if (entry.points.length > policy.maxTrailPoints) {
      entry.points = entry.points.slice(-policy.maxTrailPoints);
    }
  }
  entry.lastSeen = observedAt;
  entry.heading = finiteOr(item.heading, entry.heading);
  entry.speedMps = finiteOr(item.speedMps, entry.speedMps);
}

function recordOne(
  target: Map<string, TrailEntry>,
  source: TrackType,
  item: TrailObservation,
  now: number,
  policy: TrailPolicy,
): boolean {
  if (!isUsableObservation(item)) return false;
  const observedAt = Math.min(item.observedAt, now);
  if (now - observedAt > policy.staleMs) return false;

  const existing = target.get(item.id);
  const entry = existing?.type === source ? existing : undefined;
  if (entry && observedAt <= entry.lastSeen) return false;

  if (entry) extendEntry(entry, item, observedAt, policy);
  else target.set(item.id, newEntry(source, item, observedAt));
  return true;
}

function pruneStale(
  target: Map<string, TrailEntry>,
  source: TrackType,
  now: number,
  policy: TrailPolicy,
): boolean {
  let pruned = false;
  for (const [id, entry] of target) {
    if (entry.type === source && now - entry.lastSeen > policy.staleMs) {
      target.delete(id);
      pruned = true;
    }
  }
  return pruned;
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
    if (recordOne(target, source, item, now, policy)) changed = true;
  }
  return pruneStale(target, source, now, policy) || changed;
}

// ── Dead reckoning ───────────────────────────────────────────────────

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

/**
 * The last fix plus the motion that carries it forward. Everything the
 * renderer needs to dead-reckon one track between polls.
 */
export type TrackMotion = Readonly<{
  lat: number;
  lon: number;
  ts: number;
  headingDeg: number;
  speedMps: number;
}>;

export function trackMotion(entry: TrailEntry): TrackMotion | null {
  const last = entry.points.at(-1);
  if (!last || entry.speedMps <= 0) return null;
  return {
    lat: last.lat,
    lon: last.lon,
    ts: last.ts,
    headingDeg: entry.heading,
    speedMps: entry.speedMps,
  };
}

/**
 * Extrapolate from the last known position along its heading. Null when the
 * track is stationary, too fresh to have drifted, or too old to trust.
 */
export function interpolatePosition(
  entry: TrailEntry,
  now: number,
): { lat: number; lon: number } | null {
  const last = entry.points.at(-1);
  if (!last || entry.speedMps <= 0) return null;

  const elapsedMs = now - last.ts;
  if (elapsedMs > TRAIL_POLICY[entry.type].maxExtrapolationMs) return null;
  if (elapsedMs < MIN_EXTRAPOLATION_MS) return null;

  return movePoint(
    last.lat,
    last.lon,
    entry.heading,
    entry.speedMps * (elapsedMs / MS_PER_SECOND),
  );
}
