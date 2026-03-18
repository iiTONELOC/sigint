import type { DataPoint } from "@/features/base/dataPoints";
import type { DataProvider, ProviderSnapshot } from "@/features/base/types";
import { cacheGet, cacheSet } from "@/lib/storageService";

const FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson";

const DEFAULT_CACHE_KEY = "sigint.usgs.earthquake-cache.v1";
const MAX_CACHE_AGE_MS = 30 * 60_000; // 30 min — reject stale on hydrate

type USGSFeature = {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    felt: number | null;
    tsunami: number;
    alert: string | null;
    sig: number;
    magType: string | null;
    type: string;
    status: string;
    url: string;
  };
  geometry: {
    coordinates: [number, number, number]; // [lon, lat, depth]
  };
};

type USGSResponse = {
  features: USGSFeature[];
};

function toDataPoint(f: USGSFeature): DataPoint | null {
  const [lon, lat, depth] = f.geometry.coordinates;
  if (lat == null || lon == null) return null;

  return {
    id: `Q${f.id}`,
    type: "quakes" as const,
    lat,
    lon,
    timestamp: new Date(f.properties.time).toISOString(),
    data: {
      magnitude: f.properties.mag ?? undefined,
      depth: depth ?? undefined,
      location: f.properties.place ?? undefined,
      felt: f.properties.felt ?? undefined,
      tsunami: f.properties.tsunami === 1,
      alert: f.properties.alert ?? undefined,
      significance: f.properties.sig ?? undefined,
      magType: f.properties.magType ?? undefined,
      eventType: f.properties.type ?? undefined,
      url: f.properties.url ?? undefined,
      status: f.properties.status ?? undefined,
    },
  } as DataPoint;
}

export class EarthquakeProvider implements DataProvider<DataPoint> {
  readonly id = "earthquake";
  private cache: { data: DataPoint[]; timestamp: number } | null = null;

  private snapshot: ProviderSnapshot<DataPoint> = {
    entities: [],
    error: null,
    loading: false,
    lastUpdatedAt: null,
  };

  // ── Persistence ───────────────────────────────────────────────────

  private persistCache(data: DataPoint[]): void {
    cacheSet(DEFAULT_CACHE_KEY, { timestamp: Date.now(), data });
  }

  private readPersistedCache(): {
    data: DataPoint[];
    timestamp: number;
  } | null {
    const cached = cacheGet<{ data?: DataPoint[]; timestamp?: number }>(
      DEFAULT_CACHE_KEY,
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

  // ── Hydrate ───────────────────────────────────────────────────────

  hydrate(): DataPoint[] | null {
    if (this.cache) return this.cache.data;

    const persisted = this.readPersistedCache();
    if (!persisted || persisted.data.length === 0) return null;

    // Reject stale cache
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

  // ── Fetch ─────────────────────────────────────────────────────────

  async refresh(): Promise<DataPoint[]> {
    this.snapshot = { ...this.snapshot, loading: true, error: null };

    try {
      const response = await fetch(FEED_URL);
      if (!response.ok) {
        throw new Error(`USGS API error: ${response.status}`);
      }

      const raw: USGSResponse = await response.json();
      if (!raw.features || !Array.isArray(raw.features)) {
        throw new Error("Invalid USGS response format");
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
      // Fallback: memory cache → IndexedDB cache → empty
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

  async getData(pollInterval?: number): Promise<DataPoint[]> {
    if (this.cache) {
      // If cache is older than poll interval, kick off background refresh
      // so next read gets fresh data — but return cached data immediately
      if (pollInterval && Date.now() - this.cache.timestamp > pollInterval) {
        this.refresh().catch(() => {});
      }
      return this.cache.data;
    }
    return this.refresh();
  }

  getSnapshot(): ProviderSnapshot<DataPoint> {
    return this.snapshot;
  }
}
