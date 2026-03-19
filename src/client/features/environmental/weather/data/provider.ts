import type { DataPoint } from "@/features/base/dataPoints";
import { BaseProvider } from "@/features/base/BaseProvider";
import { CACHE_KEYS } from "@/lib/cacheKeys";

const ALERTS_URL =
  "https://api.weather.gov/alerts/active?status=actual&message_type=alert";

// ── NWS GeoJSON shape ────────────────────────────────────────────────

type NWSFeature = {
  id: string;
  type: "Feature";
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  } | null;
  properties: {
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
    geocode?: {
      SAME?: string[];
      UGC?: string[];
    };
  };
};

type NWSResponse = {
  type: "FeatureCollection";
  features: NWSFeature[];
};

// ── Helpers ──────────────────────────────────────────────────────────

function getCentroid(
  geometry: NWSFeature["geometry"],
): { lat: number; lon: number } | null {
  if (!geometry || !geometry.coordinates) return null;

  if (geometry.type === "Point") {
    const coords = geometry.coordinates as number[];
    if (coords.length >= 2) return { lat: coords[1]!, lon: coords[0]! };
  }

  if (geometry.type === "Polygon") {
    const ring = (geometry.coordinates as number[][][])[0];
    if (!ring || ring.length === 0) return null;
    let latSum = 0,
      lonSum = 0;
    for (const pt of ring) {
      lonSum += pt[0]!;
      latSum += pt[1]!;
    }
    return { lat: latSum / ring.length, lon: lonSum / ring.length };
  }

  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as unknown as number[][][][];
    const ring = polys[0]?.[0];
    if (!ring || ring.length === 0) return null;
    let latSum = 0,
      lonSum = 0;
    for (const pt of ring) {
      lonSum += pt[0]!;
      latSum += pt[1]!;
    }
    return { lat: latSum / ring.length, lon: lonSum / ring.length };
  }

  return null;
}

function toDataPoint(f: NWSFeature): DataPoint | null {
  const centroid = getCentroid(f.geometry);
  if (!centroid) return null;
  if (centroid.lat === 0 && centroid.lon === 0) return null;

  const props = f.properties;

  return {
    id: `WX${props.id.replace(/[^a-zA-Z0-9]/g, "").slice(-12)}`,
    type: "weather" as const,
    lat: centroid.lat,
    lon: centroid.lon,
    timestamp: props.sent || props.effective || new Date().toISOString(),
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
    },
  } as DataPoint;
}

// ── Fetch logic ──────────────────────────────────────────────────────

async function fetchWeather(): Promise<DataPoint[]> {
  const response = await fetch(ALERTS_URL, {
    headers: {
      "User-Agent": "(sigint-dashboard, osint-tool)",
      Accept: "application/geo+json",
    },
  });

  if (!response.ok) {
    throw new Error(`NWS API error: ${response.status}`);
  }

  const raw: NWSResponse = await response.json();
  if (!raw.features || !Array.isArray(raw.features)) {
    throw new Error("Invalid NWS response format");
  }

  const data: DataPoint[] = [];
  for (const f of raw.features) {
    const point = toDataPoint(f);
    if (point) data.push(point);
  }
  return data;
}

// ── Provider instance ────────────────────────────────────────────────

export const weatherProvider = new BaseProvider({
  id: "noaa-weather",
  cacheKey: CACHE_KEYS.weather,
  maxCacheAgeMs: 30 * 60_000,
  fetchFn: fetchWeather,
});
