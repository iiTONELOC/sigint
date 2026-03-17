import type { DataPoint } from "@/features/base/dataPoints";
import type { DataProvider, ProviderSnapshot } from "@/features/base/types";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { authenticatedFetch } from "@/lib/authService";

const SHIPS_URL = "/api/ships/latest";

const CACHE_KEY = "sigint.ais.ship-cache.v1";
const MAX_CACHE_AGE_MS = 30 * 60_000; // 30 min — generous hydration window; poll replaces in background

// ── Server response shape ────────────────────────────────────────────

type ServerVessel = {
  mmsi: number;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  heading: number;
  navStatus: number;
  navStatusLabel: string;
  lastSeen: number;
  name?: string;
  callSign?: string;
  imo?: number;
  shipType?: number;
  shipTypeLabel?: string;
  destination?: string;
  draught?: number;
  length?: number;
  width?: number;
};

type ServerResponse = {
  data: ServerVessel[];
  vesselCount: number;
  connected: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────

function toDataPoint(v: ServerVessel): DataPoint | null {
  if (v.lat == null || v.lon == null) return null;
  if (v.lat === 0 && v.lon === 0) return null;

  const sogKnots = v.sog ?? 0;
  const speedMps = sogKnots * 0.5144;

  return {
    id: `S${v.mmsi}`,
    type: "ships" as const,
    lat: v.lat,
    lon: v.lon,
    timestamp: new Date(v.lastSeen).toISOString(),
    data: {
      mmsi: v.mmsi,
      imo: v.imo,
      name: v.name,
      callSign: v.callSign,
      vesselType: v.shipTypeLabel ?? "Unknown",
      shipTypeCode: v.shipType,
      speed: Math.round(sogKnots * 10) / 10,
      sog: sogKnots,
      cog: v.cog,
      heading: v.heading,
      navStatus: v.navStatus,
      navStatusLabel: v.navStatusLabel,
      destination: v.destination,
      draught: v.draught,
      length: v.length,
      width: v.width,
      speedMps,
    },
  } as DataPoint;
}

// ── Provider ─────────────────────────────────────────────────────────

export class ShipProvider implements DataProvider<DataPoint> {
  readonly id = "ais-ships";
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
      const response = await authenticatedFetch(SHIPS_URL);

      if (!response.ok) {
        throw new Error(`Ships API error: ${response.status}`);
      }

      const json: ServerResponse = await response.json();

      if (!json.data || !Array.isArray(json.data)) {
        throw new Error("Invalid ships response format");
      }

      const data: DataPoint[] = [];
      for (const v of json.data) {
        const point = toDataPoint(v);
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
