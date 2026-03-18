import type { DataPoint } from "@/features/base/dataPoints";
import type { DataProvider, ProviderSnapshot } from "@/features/base/types";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { authenticatedFetch } from "@/lib/authService";

const FIRES_URL = "/api/fires/latest";

const CACHE_KEY = "sigint.firms.fire-cache.v1";
const MAX_CACHE_AGE_MS = 30 * 60_000; // 30 min — matches server poll

// ── Server response shape ────────────────────────────────────────────

type ServerFire = {
  lat: number;
  lon: number;
  brightness: number;
  scan: number;
  track: number;
  acqDate: string;
  acqTime: string;
  satellite: string;
  instrument: string;
  confidence: string;
  version: string;
  brightT31: number;
  frp: number;
  daynight: string;
};

type ServerResponse = {
  data: ServerFire[];
  fetchedAt: number;
  fireCount: number;
};

// ── Helpers ──────────────────────────────────────────────────────────

function parseAcqTimestamp(acqDate: string, acqTime: string): string {
  // acqDate: "2026-03-17", acqTime: "0430" (HHMM)
  if (!acqDate) return new Date().toISOString();
  const hh = acqTime.slice(0, 2) || "00";
  const mm = acqTime.slice(2, 4) || "00";
  try {
    return new Date(`${acqDate}T${hh}:${mm}:00Z`).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function toDataPoint(f: ServerFire, idx: number): DataPoint | null {
  if (f.lat == null || f.lon == null) return null;
  if (f.lat === 0 && f.lon === 0) return null;

  return {
    id: `FI${idx}-${Math.round(f.lat * 1000)}-${Math.round(f.lon * 1000)}`,
    type: "fires" as const,
    lat: f.lat,
    lon: f.lon,
    timestamp: parseAcqTimestamp(f.acqDate, f.acqTime),
    data: {
      brightness: f.brightness,
      frp: f.frp,
      confidence: f.confidence,
      satellite: f.satellite,
      instrument: f.instrument,
      scan: f.scan,
      track: f.track,
      brightT31: f.brightT31,
      daynight: f.daynight,
      acqDate: f.acqDate,
      acqTime: f.acqTime,
    },
  } as DataPoint;
}

// ── Provider ─────────────────────────────────────────────────────────

export class FireProvider implements DataProvider<DataPoint> {
  readonly id = "firms-fires";
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
      const response = await authenticatedFetch(FIRES_URL);

      if (!response.ok) {
        throw new Error(`Fires API error: ${response.status}`);
      }

      const json: ServerResponse = await response.json();

      if (!json.data || !Array.isArray(json.data)) {
        throw new Error("Invalid fires response format");
      }

      const data: DataPoint[] = [];
      for (let i = 0; i < json.data.length; i++) {
        const point = toDataPoint(json.data[i]!, i);
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
