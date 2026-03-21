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
  private fetchInProgress: Promise<DataPoint[]> | null = null;

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

  // ── Hydrate ───────────────────────────────────────────────────────

  async hydrate(): Promise<{ data: DataPoint[]; stale: boolean } | null> {
    if (this.cache) return { data: this.cache.data, stale: false };

    const persisted = await this.readPersistedCache();
    if (!persisted || persisted.data.length === 0) return null;

    const data = this.mergeFn
      ? this.mergeFn(persisted.data, [])
      : persisted.data;

    const stale = Date.now() - persisted.timestamp > this.maxCacheAgeMs;

    this.cache = { data, timestamp: persisted.timestamp };
    this.snapshot = {
      entities: data,
      lastUpdatedAt: persisted.timestamp,
      loading: stale, // signal that a refresh is needed
      error: null,
    };
    return { data, stale };
  }

  // ── Fetch ─────────────────────────────────────────────────────────

  async refresh(): Promise<DataPoint[]> {
    this.snapshot = { ...this.snapshot, loading: true, error: null };

    try {
      const incoming = await this.fetchFn();

      const data = this.mergeFn
        ? this.mergeFn(this.cache?.data ?? [], incoming)
        : incoming;

      // Upstream returned 0 records (satellite down, quota exhausted,
      // temporary outage). NEVER persist empty data — retain whatever
      // we have and treat it as a soft error.
      if (data.length === 0) {
        const fallback = this.cache?.data ?? [];
        if (fallback.length > 0) {
          this.cache = { ...this.cache!, timestamp: Date.now() };
        }
        this.snapshot = {
          entities: fallback,
          lastUpdatedAt: Date.now(),
          loading: false,
          error: null,
        };
        return fallback;
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
      const persisted = await this.readPersistedCache();
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

  /** Register a listener called whenever background refresh completes. */
  private _onChange: (() => void) | null = null;
  onChange(cb: (() => void) | null): void {
    this._onChange = cb;
  }

  private notifyChange(): void {
    this._onChange?.();
  }

  async getData(pollInterval?: number): Promise<DataPoint[]> {
    // 1. Memory cache hit — return immediately, maybe background refresh
    if (this.cache) {
      if (pollInterval && Date.now() - this.cache.timestamp > pollInterval) {
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
      }
      return this.cache.data;
    }

    // 2. Try IDB hydration — returns stale data immediately
    const hydrated = await this.hydrate();
    if (hydrated && hydrated.data.length > 0) {
      // Kick off background refresh if stale, don't block
      if (hydrated.stale && !this.fetchInProgress) {
        this.fetchInProgress = this.refresh()
          .then((data) => {
            this.notifyChange();
            return data;
          })
          .finally(() => {
            this.fetchInProgress = null;
          });
      }
      return hydrated.data;
    }

    // 3. No cache at all — must wait for fetch
    if (this.fetchInProgress) {
      return this.fetchInProgress;
    }

    this.fetchInProgress = this.refresh().finally(() => {
      this.fetchInProgress = null;
    });
    return this.fetchInProgress;
  }

  getSnapshot(): ProviderSnapshot<DataPoint> {
    return this.snapshot;
  }
}
