import { type DataPoint } from "@/features/base/dataPoints";
import {
  type DataProvider,
  type ProviderSnapshot,
} from "@/features/base/types";
import { generateMockAircraft } from "@/data/mockData";
import { getSquawkStatus } from "../lib/utils";
import { getAircraftMetadataBatch } from "./typeLookup";
import { cacheGet, cacheSet } from "@/lib/storageService";

const DEFAULT_CACHE_DURATION = 235_000;
const DEFAULT_CACHE_KEY = "sigint.opensky.aircraft-cache.v1";

export type AircraftProviderConfig = {
  cacheDurationMs?: number;
  cacheKey?: string;
};

type StoredMetadata = {
  resolvedType: string;
  registration?: string;
  manufacturerName?: string;
  model?: string;
  operator?: string;
  operatorIcao?: string;
  categoryDescription?: string;
};

function normalizeIcao24(value: string | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (!/^[0-9a-f]+$/i.test(raw)) return null;
  return raw.length < 6 ? raw.padStart(6, "0") : raw;
}

export class AircraftProvider implements DataProvider<DataPoint> {
  readonly id = "aircraft";
  private readonly cacheKey: string;
  private readonly cacheDurationMs: number;
  private fetchInProgress: Promise<DataPoint[]> | null = null;
  private cache: { data: DataPoint[]; timestamp: number } | null = null;

  private metadataByIcao = new Map<string, StoredMetadata>();
  private attemptedMetadataIcao = new Set<string>();

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

  private readPersistedCache(): {
    data: DataPoint[];
    timestamp: number;
  } | null {
    const cached = cacheGet<{ data?: DataPoint[]; timestamp?: number }>(
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

  private hydrateMemoryCacheFromPersisted(): void {
    if (this.cache) return;
    const persisted = this.readPersistedCache();
    if (!persisted || persisted.data.length === 0) return;
    this.cache = { data: persisted.data, timestamp: persisted.timestamp };
    this.snapshot = {
      entities: persisted.data,
      lastUpdatedAt: Date.now(),
      loading: false,
      error: null,
    };

    for (const entity of persisted.data) {
      if (entity.type !== "aircraft") continue;
      const key = normalizeIcao24(entity.data?.icao24);
      if (!key) continue;
      const d = entity.data;
      if (d?.acType && d.acType !== "Unknown") {
        this.metadataByIcao.set(key, {
          resolvedType: d.acType,
          registration: d.registration,
          manufacturerName: d.manufacturerName,
          model: d.model,
          operator: d.operator,
          operatorIcao: d.operatorIcao,
          categoryDescription: d.categoryDescription,
        });
        this.attemptedMetadataIcao.add(key);
      }
    }
  }

  private applyMetadata(entities: DataPoint[]): DataPoint[] {
    if (this.metadataByIcao.size === 0) return entities;

    return entities.map((entity) => {
      if (entity.type !== "aircraft") return entity;
      const key = normalizeIcao24(entity.data?.icao24);
      if (!key) return entity;
      const meta = this.metadataByIcao.get(key);
      if (!meta) return entity;

      return {
        ...entity,
        data: {
          ...entity.data,
          acType: meta.resolvedType || entity.data?.acType || "Unknown",
          registration: meta.registration,
          manufacturerName: meta.manufacturerName,
          model: meta.model,
          operator: meta.operator,
          operatorIcao: meta.operatorIcao,
          categoryDescription: meta.categoryDescription,
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

  hydrate(): DataPoint[] | null {
    this.hydrateMemoryCacheFromPersisted();
    return this.cache?.data ?? null;
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
      const persisted = this.readPersistedCache();
      const fallback =
        this.cache?.data ?? persisted?.data ?? generateMockAircraft();
      this.snapshot = {
        entities: fallback,
        lastUpdatedAt: Date.now(),
        loading: false,
        error: error instanceof Error ? error : new Error("Unknown error"),
      };
      return fallback;
    }
  }

  getData(): Promise<DataPoint[]> {
    this.hydrateMemoryCacheFromPersisted();

    const now = Date.now();
    if (this.cache && now - this.cache.timestamp < this.cacheDurationMs) {
      return Promise.resolve(this.cache.data);
    }

    if (this.fetchInProgress) {
      return this.cache
        ? Promise.resolve(this.cache.data)
        : this.fetchInProgress;
    }

    this.fetchInProgress = this.refresh().finally(() => {
      this.fetchInProgress = null;
    });

    if (this.cache) return Promise.resolve(this.cache.data);
    return this.fetchInProgress;
  }

  getSnapshot(): ProviderSnapshot<DataPoint> {
    return this.snapshot;
  }

  async enrichAircraftByIcao24(
    icao24List: string[],
  ): Promise<DataPoint[] | null> {
    const normalized = Array.from(
      new Set(
        icao24List
          .map((value) => normalizeIcao24(value))
          .filter((value): value is string => value !== null),
      ),
    );

    const pending = normalized.filter(
      (icao24) => !this.attemptedMetadataIcao.has(icao24),
    );

    if (pending.length === 0) {
      return null;
    }

    pending.forEach((icao24) => this.attemptedMetadataIcao.add(icao24));
    const metadataByIcao = await getAircraftMetadataBatch(pending);
    if (metadataByIcao.size === 0) {
      return null;
    }

    for (const [icao, meta] of metadataByIcao) {
      this.metadataByIcao.set(icao, {
        resolvedType: meta.resolvedType,
        registration: meta.registration,
        manufacturerName: meta.manufacturerName,
        model: meta.model,
        operator: meta.operator,
        operatorIcao: meta.operatorIcao,
        categoryDescription: meta.categoryDescription,
      });
    }

    if (this.cache) {
      this.cache = { ...this.cache, data: this.applyMetadata(this.cache.data) };
      this.persistCache(this.cache.data);
    }

    this.snapshot = {
      ...this.snapshot,
      entities: this.applyMetadata(this.snapshot.entities),
      lastUpdatedAt: Date.now(),
    };

    return this.cache?.data ?? this.snapshot.entities;
  }
}
