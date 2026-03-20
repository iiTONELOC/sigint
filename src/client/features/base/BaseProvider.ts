import type { DataPoint } from "@/features/base/dataPoints";
import type { DataProvider, ProviderSnapshot } from "@/features/base/types";
import { cacheGet, cacheSet } from "@/lib/storageService";

// ── Config each concrete provider supplies ───────────────────────────

export type BaseProviderConfig = {
  /** Unique provider id */
  id: string;

  /** IndexedDB cache key */
  cacheKey: string;

  /** Max age (ms) before hydrate rejects stale persisted data */
  maxCacheAgeMs: number;

  /**
   * Fetch + parse remote data into DataPoint[].
   * The base class handles caching, snapshots, and error fallback.
   */
  fetchFn: () => Promise<DataPoint[]>;

  /**
   * Optional: merge incoming data with existing cache.
   * If omitted, incoming data replaces the cache entirely.
   * Used by GDELT for dedup + rolling-window pruning.
   */
  mergeFn?: (existing: DataPoint[], incoming: DataPoint[]) => DataPoint[];
};

// ── Base class ───────────────────────────────────────────────────────

export class BaseProvider implements DataProvider<DataPoint> {
  readonly id: string;

  private cacheKey: string;
  private maxCacheAgeMs: number;
  private fetchFn: () => Promise<DataPoint[]>;
  private mergeFn?: (
    existing: DataPoint[],
    incoming: DataPoint[],
  ) => DataPoint[];

  protected cache: { data: DataPoint[]; timestamp: number } | null = null;

  private snapshot: ProviderSnapshot<DataPoint> = {
    entities: [],
    error: null,
    loading: false,
    lastUpdatedAt: null,
  };

  constructor(config: BaseProviderConfig) {
    this.id = config.id;
    this.cacheKey = config.cacheKey;
    this.maxCacheAgeMs = config.maxCacheAgeMs;
    this.fetchFn = config.fetchFn;
    this.mergeFn = config.mergeFn;
  }

  // ── Persistence ───────────────────────────────────────────────────

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

  // ── Hydrate ───────────────────────────────────────────────────────

  hydrate(): DataPoint[] | null {
    if (this.cache) return this.cache.data;

    const persisted = this.readPersistedCache();
    if (!persisted || persisted.data.length === 0) return null;
    if (Date.now() - persisted.timestamp > this.maxCacheAgeMs) return null;

    const data = this.mergeFn
      ? this.mergeFn(persisted.data, [])
      : persisted.data;

    this.cache = { data, timestamp: persisted.timestamp };
    this.snapshot = {
      entities: data,
      lastUpdatedAt: persisted.timestamp,
      loading: false,
      error: null,
    };
    return data;
  }

  // ── Fetch ─────────────────────────────────────────────────────────

  async refresh(): Promise<DataPoint[]> {
    this.snapshot = { ...this.snapshot, loading: true, error: null };

    try {
      const incoming = await this.fetchFn();

      const data = this.mergeFn
        ? this.mergeFn(this.cache?.data ?? [], incoming)
        : incoming;

      // Retain stale cache when upstream returns 0 records (quota exhausted /
      // temporary outage). Same pattern as server-side FIRMS and GDELT caches.
      if (data.length === 0 && this.cache && this.cache.data.length > 0) {
        this.cache = { ...this.cache, timestamp: Date.now() };
        this.snapshot = {
          entities: this.cache.data,
          lastUpdatedAt: Date.now(),
          loading: false,
          error: null,
        };
        return this.cache.data;
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
