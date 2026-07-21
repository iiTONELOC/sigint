import type { DataPoint } from "@/features/base/dataPoints";
import type { FireData } from "@/features/environmental/fires/types";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import { authenticatedFetch } from "@/lib/net/authService";
import { createGeoPoint, isRecord } from "@shared/geo";

export type FirePoint = Extract<DataPoint, { type: "fires" }>;

export type FireCacheSnapshot = Readonly<{
  timestamp: number;
  data: FirePoint[];
}>;

export type FireSourcePolicy = Readonly<{
  id: "fire";
  renderSource: "fires";
  cacheKey: string;
  feedUrl: string;
  pollIntervalMs: number;
  retryIntervalMs: number;
  freshDurationMs: number;
  requestTimeoutMs: number;
  identityRule: "satellite_acquisition_coordinate";
  observationTimestampRule: "firms_acquisition_time";
  completenessRule: "successful_server_snapshot_replaces_source";
  deletionRule: "absent_from_complete_snapshot";
}>;

const MINUTE_MS = 60_000;

export const FIRE_SOURCE_POLICY: FireSourcePolicy = {
  id: "fire",
  renderSource: "fires",
  cacheKey: CACHE_KEYS.fires,
  feedUrl: "/api/fires/latest",
  pollIntervalMs: POLL_INTERVALS.fires,
  retryIntervalMs: MINUTE_MS,
  freshDurationMs: 30 * MINUTE_MS,
  requestTimeoutMs: 20_000,
  identityRule: "satellite_acquisition_coordinate",
  observationTimestampRule: "firms_acquisition_time",
  completenessRule: "successful_server_snapshot_replaces_source",
  deletionRule: "absent_from_complete_snapshot",
};

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function fireConfidenceLevel(confidence: string | undefined): number {
  const normalized = confidence?.toLowerCase();
  if (normalized === "high" || normalized === "h") return 2;
  if (normalized === "nominal" || normalized === "n") return 1;
  return 0;
}

function parseFireData(value: unknown): FireData | null {
  if (!isRecord(value)) return null;
  return {
    brightness: optionalFiniteNumber(value.brightness),
    frp: optionalFiniteNumber(value.frp),
    confidence: optionalString(value.confidence),
    satellite: optionalString(value.satellite),
    instrument: optionalString(value.instrument),
    scan: optionalFiniteNumber(value.scan),
    track: optionalFiniteNumber(value.track),
    brightT31: optionalFiniteNumber(value.brightT31),
    daynight: optionalString(value.daynight),
    acqDate: optionalString(value.acqDate),
    acqTime: optionalString(value.acqTime),
    complexSize: optionalFiniteNumber(value.complexSize),
    complexFrp: optionalFiniteNumber(value.complexFrp),
  };
}

export function parseFirePoint(value: unknown): FirePoint | null {
  if (
    !isRecord(value) ||
    value.type !== "fires" ||
    typeof value.id !== "string" ||
    typeof value.lat !== "number" ||
    typeof value.lon !== "number"
  ) {
    return null;
  }
  const coordinate = createGeoPoint(value.lon, value.lat);
  const data = parseFireData(value.data);
  if (!coordinate || !data) return null;
  const timestamp =
    typeof value.timestamp === "string" ? value.timestamp : undefined;
  return {
    id: value.id,
    type: "fires",
    lat: coordinate[1],
    lon: coordinate[0],
    ...(timestamp ? { timestamp } : {}),
    data,
  };
}

function acquisitionTimestamp(
  acquisitionDate: string,
  acquisitionTime: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acquisitionDate)) return null;
  if (!/^\d{4}$/.test(acquisitionTime)) return null;
  const timestamp = Date.parse(
    `${acquisitionDate}T${acquisitionTime.slice(0, 2)}:${acquisitionTime.slice(2)}:00Z`,
  );
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseServerFire(value: unknown): FirePoint | null {
  if (!isRecord(value)) return null;
  const latitude = optionalFiniteNumber(value.lat);
  const longitude = optionalFiniteNumber(value.lon);
  const acquisitionDate = optionalString(value.acqDate);
  const acquisitionTime = optionalString(value.acqTime);
  if (
    latitude === undefined ||
    longitude === undefined ||
    (latitude === 0 && longitude === 0) ||
    !acquisitionDate ||
    !acquisitionTime
  ) {
    return null;
  }
  const coordinate = createGeoPoint(longitude, latitude);
  const timestamp = acquisitionTimestamp(acquisitionDate, acquisitionTime);
  if (!coordinate || !timestamp) return null;
  const satellite = optionalString(value.satellite) ?? "unknown";
  const id = [
    "FI",
    satellite,
    acquisitionDate.replaceAll("-", ""),
    acquisitionTime,
    coordinate[1].toFixed(4),
    coordinate[0].toFixed(4),
  ].join(":");
  return {
    id,
    type: "fires",
    lat: coordinate[1],
    lon: coordinate[0],
    timestamp,
    data: {
      brightness: optionalFiniteNumber(value.brightness),
      frp: optionalFiniteNumber(value.frp),
      confidence: optionalString(value.confidence),
      satellite,
      instrument: optionalString(value.instrument),
      scan: optionalFiniteNumber(value.scan),
      track: optionalFiniteNumber(value.track),
      brightT31: optionalFiniteNumber(value.brightT31),
      daynight: optionalString(value.daynight),
      acqDate: acquisitionDate,
      acqTime: acquisitionTime,
      complexSize: optionalFiniteNumber(value.complexSize),
      complexFrp: optionalFiniteNumber(value.complexFrp),
    },
  };
}

export function parseFireFeed(value: unknown): FirePoint[] {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new Error("Invalid fires response format");
  }
  const points: FirePoint[] = [];
  for (const candidate of value.data) {
    const point = parseServerFire(candidate);
    if (point) points.push(point);
  }
  return points;
}

export function parseFireCacheSnapshot(
  value: unknown,
): FireCacheSnapshot | null {
  if (
    !isRecord(value) ||
    typeof value.timestamp !== "number" ||
    !Number.isFinite(value.timestamp) ||
    !Array.isArray(value.data)
  ) {
    return null;
  }
  const data: FirePoint[] = [];
  for (const candidate of value.data) {
    const point = parseFirePoint(candidate);
    if (!point) return null;
    data.push(point);
  }
  return { timestamp: value.timestamp, data };
}

export async function fetchFires(): Promise<FirePoint[]> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    FIRE_SOURCE_POLICY.requestTimeoutMs,
  );
  try {
    const response = await authenticatedFetch(FIRE_SOURCE_POLICY.feedUrl, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Fires API error: ${response.status}`);
    }
    const payload: unknown = await response.json();
    return parseFireFeed(payload);
  } finally {
    clearTimeout(timeout);
  }
}
