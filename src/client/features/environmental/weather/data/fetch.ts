import type { WeatherPoint } from "@/features/environmental/weather/data/codec";
import type { WeatherGeometry } from "@/features/environmental/weather/types";

const ALERTS_URL =
  "https://api.weather.gov/alerts/active?status=actual&message_type=alert";

const WEATHER_ERROR = {
  request: "The weather alerts request failed",
  format: "The weather alerts response was not NWS GeoJSON",
} as const;

const REQUEST_HEADERS: Readonly<Record<string, string>> = {
  "User-Agent": "(sigint-dashboard, osint-tool)",
  Accept: "application/geo+json",
};

const ID_PREFIX = "WX";
const ID_TAIL_LENGTH = 12;
const ID_ALLOWED = /[^a-zA-Z0-9]/g;

// ── NWS GeoJSON shape ────────────────────────────────────────────────

type NWSFeature = Readonly<{
  id: string;
  type: "Feature";
  geometry: WeatherGeometry | null;
  properties: Readonly<{
    id: string;
    event: string;
    severity: string;
    certainty: string;
    urgency: string;
    headline: string;
    description: string;
    instruction: string | null;
    senderName: string;
    areaDesc: string;
    onset: string;
    expires: string;
    effective: string;
    sent: string;
    status: string;
    messageType: string;
    category: string;
    response: string;
  }>;
}>;

type NWSResponse = Readonly<{
  type: "FeatureCollection";
  features: NWSFeature[];
}>;

type Centroid = Readonly<{ lat: number; lon: number }>;

// ── Centroid ─────────────────────────────────────────────────────────

function isPositionList(value: unknown): value is number[][] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry: unknown) =>
        Array.isArray(entry) &&
        entry.length >= 2 &&
        typeof entry[0] === "number" &&
        typeof entry[1] === "number",
    )
  );
}

function ringCentroid(ring: readonly number[][]): Centroid {
  let latSum = 0;
  let lonSum = 0;
  for (const [lon, lat] of ring) {
    lonSum += lon ?? 0;
    latSum += lat ?? 0;
  }
  return { lat: latSum / ring.length, lon: lonSum / ring.length };
}

/** First ring is the outer boundary for both Polygon and MultiPolygon. */
function firstRing(coordinates: unknown): number[][] | null {
  if (isPositionList(coordinates)) return coordinates;
  if (!Array.isArray(coordinates)) return null;
  for (const nested of coordinates) {
    const ring = firstRing(nested);
    if (ring) return ring;
  }
  return null;
}

function getCentroid(geometry: WeatherGeometry | null): Centroid | null {
  if (!geometry) return null;
  if (geometry.type === "Point") {
    const coords = geometry.coordinates;
    const lon = coords[0];
    const lat = coords[1];
    return typeof lon === "number" && typeof lat === "number"
      ? { lat, lon }
      : null;
  }
  const ring = firstRing(geometry.coordinates);
  return ring ? ringCentroid(ring) : null;
}

// ── Mapping ──────────────────────────────────────────────────────────

function toWeatherPoint(
  feature: NWSFeature,
  now: number,
): WeatherPoint | null {
  const centroid = getCentroid(feature.geometry);
  if (!centroid) return null;
  if (centroid.lat === 0 && centroid.lon === 0) return null;

  const props = feature.properties;
  return {
    id: `${ID_PREFIX}${props.id.replace(ID_ALLOWED, "").slice(-ID_TAIL_LENGTH)}`,
    type: "weather",
    lat: centroid.lat,
    lon: centroid.lon,
    timestamp:
      props.sent || props.effective || new Date(now).toISOString(),
    data: {
      event: props.event,
      severity: props.severity,
      certainty: props.certainty,
      urgency: props.urgency,
      headline: props.headline,
      description: props.description,
      instruction: props.instruction ?? undefined,
      senderName: props.senderName,
      areaDesc: props.areaDesc,
      onset: props.onset,
      expires: props.expires,
      status: props.status,
      messageType: props.messageType,
      category: props.category,
      response: props.response,
      geometry: feature.geometry ?? undefined,
    },
  };
}

export type WeatherFetchSnapshot = Readonly<{
  completeness: "complete";
  entities: readonly WeatherPoint[];
  observedAt: number;
}>;

/** The NWS active-alerts feed is the whole current set every time. */
export async function fetchWeatherSnapshot(
  now: () => number = Date.now,
): Promise<WeatherFetchSnapshot> {
  const response = await fetch(ALERTS_URL, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(WEATHER_ERROR.request);

  const raw: NWSResponse = await response.json();
  if (!Array.isArray(raw.features)) throw new Error(WEATHER_ERROR.format);

  const observedAt = now();
  const entities: WeatherPoint[] = [];
  for (const feature of raw.features) {
    const point = toWeatherPoint(feature, observedAt);
    if (point) entities.push(point);
  }
  return { completeness: "complete", entities, observedAt };
}
