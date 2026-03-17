import type { DataPoint } from "@/features/base/dataPoints";
import type { DataProvider, ProviderSnapshot } from "@/features/base/types";
import { cacheGet, cacheSet } from "@/lib/storageService";

// Active alerts — GeoJSON FeatureCollection, US-only
// No API key required, just User-Agent header
const ALERTS_URL =
  "https://api.weather.gov/alerts/active?status=actual&message_type=alert";

const CACHE_KEY = "sigint.noaa.weather-cache.v1";
const MAX_CACHE_AGE_MS = 30 * 60_000; // 30 min — generous hydration window; poll replaces in background

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

// ── Provider ─────────────────────────────────────────────────────────

export class WeatherProvider implements DataProvider<DataPoint> {
  readonly id = "noaa-weather";
  private cache: { data: DataPoint[]; timestamp: number } | null = null;

  private snapshot: ProviderSnapshot<DataPoint> = {
    entities: [],
    error: null,
    loading: false,
    lastUpdatedAt: null,
  };

  // ── Persistence ─────────────────────────────────────────────────

  private persistCache(data: DataPoint[]): void {
    cacheSet(CACHE_KEY, { timestamp: Date.now(), data });
  }

  private readPersistedCache(): {
    data: DataPoint[];
    timestamp: number;
  } | null {
    const cached = cacheGet<{ data?: DataPoint[]; timestamp?: number }>(
      CACHE_KEY,
    );
    if (!cached || !Array.isArray(cached.data)) return null;
    return {
      data: cached.data,
      timestamp:
        typeof cached.timestamp === "number" &&
        Number.isFinite(cached.timestamp)
          ? cached.timestamp
          : 0,
    };
  }

  // ── Hydrate ─────────────────────────────────────────────────────

  hydrate(): DataPoint[] | null {
    if (this.cache) return this.cache.data;

    const persisted = this.readPersistedCache();
    if (!persisted || persisted.data.length === 0) return null;
    if (Date.now() - persisted.timestamp > MAX_CACHE_AGE_MS) return null;

    this.cache = { data: persisted.data, timestamp: persisted.timestamp };
    this.snapshot = {
      entities: persisted.data,
      lastUpdatedAt: persisted.timestamp,
      loading: false,
      error: null,
    };
    return persisted.data;
  }

  // ── Fetch ───────────────────────────────────────────────────────

  async refresh(): Promise<DataPoint[]> {
    this.snapshot = { ...this.snapshot, loading: true, error: null };

    try {
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

      this.cache = { data, timestamp: Date.now() };
      this.persistCache(data);
      this.snapshot = {
        entities: data,
        lastUpdatedAt: Date.now(),
        loading: false,
        error: null,
      };
      return data;
    } catch (error) {
      const persisted = this.readPersistedCache();
      const fallback = this.cache?.data ?? persisted?.data ?? [];
      this.snapshot = {
        entities: fallback,
        lastUpdatedAt: Date.now(),
        loading: false,
        error: error instanceof Error ? error : new Error("Unknown error"),
      };
      return fallback;
    }
  }

  async getData(): Promise<DataPoint[]> {
    if (this.cache) return this.cache.data;
    return this.refresh();
  }

  getSnapshot(): ProviderSnapshot<DataPoint> {
    return this.snapshot;
  }
}
