import type { DataPoint } from "@/features/base/dataPoints";
import type { EarthquakeData } from "@/features/environmental/earthquake/types";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import { createGeoPoint, isRecord } from "@shared/geo";

export type EarthquakePoint = Extract<DataPoint, { type: "quakes" }>;

export type EarthquakeSourcePolicy = Readonly<{
  id: "earthquake";
  renderSource: "quakes";
  cacheKey: string;
  feedUrl: string;
  pollIntervalMs: number;
  retryIntervalMs: number;
  freshDurationMs: number;
  requestTimeoutMs: number;
  identityRule: "usgs_feature_id";
  observationTimestampRule: "usgs_origin_time";
  completenessRule: "successful_feed_replaces_source";
  deletionRule: "absent_from_complete_feed";
}>;

const MINUTE_MS = 60_000;

export const EARTHQUAKE_SOURCE_POLICY: EarthquakeSourcePolicy = {
  id: "earthquake",
  renderSource: "quakes",
  cacheKey: CACHE_KEYS.earthquake,
  feedUrl:
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
  pollIntervalMs: POLL_INTERVALS.earthquakes,
  retryIntervalMs: MINUTE_MS,
  freshDurationMs: 30 * MINUTE_MS,
  requestTimeoutMs: 20_000,
  identityRule: "usgs_feature_id",
  observationTimestampRule: "usgs_origin_time",
  completenessRule: "successful_feed_replaces_source",
  deletionRule: "absent_from_complete_feed",
};

type EarthquakeFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseEarthquakeData(value: unknown): EarthquakeData | null {
  if (!isRecord(value)) return null;
  return {
    magnitude: optionalFiniteNumber(value.magnitude),
    depth: optionalFiniteNumber(value.depth),
    location: optionalString(value.location),
    felt: optionalFiniteNumber(value.felt),
    tsunami:
      typeof value.tsunami === "boolean" ? value.tsunami : undefined,
    alert: optionalString(value.alert),
    significance: optionalFiniteNumber(value.significance),
    magType: optionalString(value.magType),
    eventType: optionalString(value.eventType),
    url: optionalString(value.url),
    status: optionalString(value.status),
  };
}

export function parseEarthquakePoint(
  value: unknown,
): EarthquakePoint | null {
  if (
    !isRecord(value) ||
    value.type !== "quakes" ||
    typeof value.id !== "string" ||
    typeof value.lat !== "number" ||
    typeof value.lon !== "number"
  ) {
    return null;
  }
  const coordinate = createGeoPoint(value.lon, value.lat);
  const data = parseEarthquakeData(value.data);
  if (!coordinate || !data) return null;
  const timestamp =
    typeof value.timestamp === "string" ? value.timestamp : undefined;
  return {
    id: value.id,
    type: "quakes",
    lat: coordinate[1],
    lon: coordinate[0],
    ...(timestamp ? { timestamp } : {}),
    data,
  };
}

function parseFeedFeature(value: unknown): EarthquakePoint | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (!isRecord(value.properties) || !isRecord(value.geometry)) return null;
  const coordinates = value.geometry.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const longitude = coordinates[0];
  const latitude = coordinates[1];
  if (typeof longitude !== "number" || typeof latitude !== "number") {
    return null;
  }
  const coordinate = createGeoPoint(longitude, latitude);
  const originTime = value.properties.time;
  if (
    !coordinate ||
    typeof originTime !== "number" ||
    !Number.isFinite(originTime)
  ) {
    return null;
  }
  const depth = optionalFiniteNumber(coordinates[2]);
  return {
    id: `Q${value.id}`,
    type: "quakes",
    lat: coordinate[1],
    lon: coordinate[0],
    timestamp: new Date(originTime).toISOString(),
    data: {
      magnitude: optionalFiniteNumber(value.properties.mag),
      depth,
      location: optionalString(value.properties.place),
      felt: optionalFiniteNumber(value.properties.felt),
      tsunami: value.properties.tsunami === 1,
      alert: optionalString(value.properties.alert),
      significance: optionalFiniteNumber(value.properties.sig),
      magType: optionalString(value.properties.magType),
      eventType: optionalString(value.properties.type),
      url: optionalString(value.properties.url),
      status: optionalString(value.properties.status),
    },
  };
}

export function parseEarthquakeFeed(value: unknown): EarthquakePoint[] {
  if (!isRecord(value) || !Array.isArray(value.features)) {
    throw new Error("Invalid USGS response format");
  }
  const points: EarthquakePoint[] = [];
  for (const feature of value.features) {
    const point = parseFeedFeature(feature);
    if (point) points.push(point);
  }
  return points;
}

export async function fetchEarthquakes(
  fetchImpl: EarthquakeFetch = globalThis.fetch,
): Promise<EarthquakePoint[]> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    EARTHQUAKE_SOURCE_POLICY.requestTimeoutMs,
  );
  try {
    const response = await fetchImpl(
      EARTHQUAKE_SOURCE_POLICY.feedUrl,
      { signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error(`USGS API error: ${response.status}`);
    }
    const payload: unknown = await response.json();
    return parseEarthquakeFeed(payload);
  } finally {
    clearTimeout(timeout);
  }
}
