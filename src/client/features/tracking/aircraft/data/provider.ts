import { type DataPoint } from "@/features/base/dataPoints";
import {
  type DataProvider,
  type ProviderSnapshot,
} from "@/features/base/types";
import { generateMockAircraft } from "@/data/mockData";
import { getSquawkStatus, normalizeIcao24 } from "../lib/utils";
import { ensureMetadataDb, getMetadataSync } from "./typeLookup";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

const DEFAULT_CACHE_DURATION = 30 * 60_000;
const DEFAULT_CACHE_KEY = CACHE_KEYS.aircraft;

export type AircraftProviderConfig = {
  cacheDurationMs?: number;
  cacheKey?: string;
};

export class AircraftProvider implements DataProvider<DataPoint> {
  readonly id = "aircraft";
  private readonly cacheKey: string;
  private readonly cacheDurationMs: number;
  private fetchInProgress: Promise<DataPoint[]> | null = null;
  private cache: { data: DataPoint[]; timestamp: number } | null = null;

  private snapshot: ProviderSnapshot<DataPoint> = {
    entities: [],
    error: null,
    loading: false,
    lastUpdatedAt: null,
  };

  constructor(config: AircraftProviderConfig = {}) {
    this.cacheDurationMs = config.cacheDurationMs ?? DEFAULT_CACHE_DURATION;
    this.cacheKey = config.cacheKey ?? DEFAULT_CACHE_KEY;
  }

  private persistCache(data: DataPoint[]): void {
    cacheSet(this.cacheKey, { timestamp: Date.now(), data });
  }

  private async readPersistedCache(): Promise<{
    data: DataPoint[];
    timestamp: number;
  } | null> {
    const cached = await cacheGet<{ data?: DataPoint[]; timestamp?: number }>(
      this.cacheKey,
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

  private async hydrateMemoryCacheFromPersisted(): Promise<void> {
    if (this.cache) return;
    const persisted = await this.readPersistedCache();
    if (!persisted || persisted.data.length === 0) return;

    this.cache = { data: persisted.data, timestamp: persisted.timestamp };
    this.snapshot = {
      entities: persisted.data,
      lastUpdatedAt: Date.now(),
      loading: false,
      error: null,
    };
    this.notifyChange();
  }

  private applyMetadata(entities: DataPoint[]): DataPoint[] {
    return entities.map((entity) => {
      if (entity.type !== "aircraft") return entity;
      const d = entity.data as any;
      const key = normalizeIcao24(d?.icao24);
      if (!key) return entity;

      const meta = getMetadataSync(key);
      if (!meta) return entity;

      return {
        ...entity,
        data: {
          ...d,
          acType: meta.resolvedType || d?.acType || "Unknown",
          registration: meta.registration,
          manufacturerName: meta.manufacturerName,
          model: meta.model,
          operator: meta.operator,
          operatorIcao: meta.operatorIcao,
          categoryDescription: meta.categoryDescription,
          military: meta.military,
        },
      } as DataPoint;
    });
  }

  private async fetchOpenSkyStates(): Promise<DataPoint[]> {
    const response = await fetch("https://opensky-network.org/api/states/all");

    if (!response.ok) {
      throw new Error(`OpenSky API error: ${response.status}`);
    }

    const raw = await response.json();

    if (!raw.states || !Array.isArray(raw.states)) {
      throw new Error("Invalid OpenSky response format");
    }

    const filteredStates = raw.states.filter(
      (s: any) => s[0] && s[5] !== null && s[6] !== null,
    );

    const aircraft = filteredStates.map((s: any) => {
      const squawk = s[14] != null ? String(s[14]) : undefined;
      const icao24 = normalizeIcao24(String(s[0] ?? "")) ?? String(s[0] ?? "");
      const speedMps = typeof s[9] === "number" ? s[9] : undefined;

      return {
        id: `A${s[0]}`,
        type: "aircraft" as const,
        lat: s[6],
        lon: s[5],
        timestamp: new Date().toISOString(),
        data: {
          icao24,
          callsign: s[1]?.trim() || "Unknown",
          originCountry: s[2] || "",
          acType: "Unknown",
          altitude: typeof s[13] === "number" ? Math.round(s[13] * 3.28084) : 0,
          speed: speedMps ? Math.round(speedMps * 1.944) : 0,
          speedMps,
          heading: Math.round(s[10] ?? 0),
          verticalRate: s[11],
          onGround: s[8] === true,
          squawk,
          squawkStatus: getSquawkStatus(squawk),
        },
      } as DataPoint;
    });

    const enriched = this.applyMetadata(aircraft);
    this.persistCache(enriched);
    return enriched;
  }

  async hydrate(): Promise<{ data: DataPoint[]; stale: boolean } | null> {
    await this.hydrateMemoryCacheFromPersisted();
    if (!this.cache) return null;
    const stale = Date.now() - this.cache.timestamp > this.cacheDurationMs;
    return { data: this.cache.data, stale };
  }

  async refresh(): Promise<DataPoint[]> {
    this.snapshot = { ...this.snapshot, loading: true, error: null };

    try {
      const data = await this.fetchOpenSkyStates();
      this.cache = { data, timestamp: Date.now() };
      this.snapshot = {
        entities: data,
        lastUpdatedAt: Date.now(),
        loading: false,
        error: null,
      };
      return data;
    } catch (error) {
      const persisted = await this.readPersistedCache();
      const fallback =
        this.cache?.data ?? persisted?.data ?? generateMockAircraft();
      if (this.cache) {
        this.cache = { ...this.cache, timestamp: Date.now() };
      } else if (persisted?.data) {
        this.cache = { data: persisted.data, timestamp: Date.now() };
      }
      this.snapshot = {
        entities: fallback,
        lastUpdatedAt: Date.now(),
        loading: false,
        error: error instanceof Error ? error : new Error("Unknown error"),
      };
      return fallback;
    }
  }

  /** Register a listener called whenever background refresh completes. */
  private _onChange: (() => void) | null = null;
  onChange(cb: (() => void) | null): void {
    this._onChange = cb;
  }

  private notifyChange(): void {
    this._onChange?.();
  }

  async getData(pollInterval: number = 240_000): Promise<DataPoint[]> {
    // If we have memory cache (from background hydration), use it
    if (this.cache) {
      const cacheAge = Date.now() - this.cache.timestamp;
      if (cacheAge < pollInterval) {
        return this.cache.data;
      }
      if (!this.fetchInProgress) {
        this.fetchInProgress = this.refresh()
          .then((data) => {
            this.notifyChange();
            return data;
          })
          .finally(() => {
            this.fetchInProgress = null;
          });
      }
      return this.cache.data;
    }

    // No cache yet — fetch immediately, don't block on IDB
    if (this.fetchInProgress) {
      return this.fetchInProgress;
    }

    this.fetchInProgress = this.refresh()
      .then((data) => {
        this.notifyChange();
        return data;
      })
      .finally(() => {
        this.fetchInProgress = null;
      });
    return this.fetchInProgress;
  }

  getSnapshot(): ProviderSnapshot<DataPoint> {
    return this.snapshot;
  }

  /**
   * Kept for contract — DataContext calls this on aircraft selection.
   * With local DB, applyMetadata already handles everything inline,
   * so this just re-applies in case the DB finished loading after
   * the last refresh.
   */
  async enrichAircraftByIcao24(
    _icao24List: string[],
  ): Promise<DataPoint[] | null> {
    await ensureMetadataDb();

    if (!this.cache) return null;

    const enriched = this.applyMetadata(this.cache.data);
    const changed = enriched.some((e, i) => {
      const old = this.cache!.data[i];
      return old && (e.data as any)?.acType !== (old.data as any)?.acType;
    });

    if (!changed) return null;

    this.cache = { ...this.cache, data: enriched };
    this.persistCache(enriched);
    this.snapshot = {
      ...this.snapshot,
      entities: enriched,
      lastUpdatedAt: Date.now(),
    };
    return enriched;
  }

  /**
   * Ensures local metadata DB is loaded, then re-applies metadata
   * in a single pass. No network round-trips, no chunking, no delays.
   */
  async backgroundEnrich(): Promise<void> {
    if (!this.cache) return;

    await ensureMetadataDb();

    const enriched = this.applyMetadata(this.cache.data);
    const changed = enriched.some((e, i) => {
      const old = this.cache!.data[i];
      return old && (e.data as any)?.acType !== (old.data as any)?.acType;
    });

    if (!changed) return;

    this.cache = { ...this.cache, data: enriched };
    this.persistCache(enriched);
    this.snapshot = {
      ...this.snapshot,
      entities: enriched,
      lastUpdatedAt: Date.now(),
    };
  }
}
