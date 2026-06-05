import type { DataPoint } from "@/features/base/dataPoints";
import type { DataProvider, ProviderSnapshot } from "@/features/base/types";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { diffAndApply } from "@/features/base/diffEntities";

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

  /**
   * If true, an empty incoming array is the authoritative truth and persists
   * normally. If false (default), an empty result with a non-empty cache is
   * treated as a soft error and the prior cache is retained with a bumped
   * timestamp.
   *
   * Set true for cyclones — out of season the NHC endpoint legitimately
   * reports zero active storms. Leave false for FIRMS / GDELT / AIS where
   * empty likely means quota exhaustion or a temporary upstream outage.
   */
  allowEmptyResult?: boolean;
};

// ── Base class ───────────────────────────────────────────────────────

export class BaseProvider implements DataProvider<DataPoint> {
  readonly id: string;

  private readonly cacheKey: string;
  private readonly maxCacheAgeMs: number;
  private readonly fetchFn: () => Promise<DataPoint[]>;
  private readonly mergeFn?: (
    existing: DataPoint[],
    incoming: DataPoint[],
  ) => DataPoint[];
  private readonly allowEmptyResult: boolean;

  protected cache: { data: DataPoint[]; timestamp: number } | null = null;
  private fetchInProgress: Promise<DataPoint[]> | null = null;

  private snapshot: ProviderSnapshot<DataPoint> = {
    entities: [],
    version: 0,
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
    this.allowEmptyResult = config.allowEmptyResult ?? false;
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
    // Always mark stale when there's persisted data so the boot
    // sequence triggers a background refresh in addition to displaying
    // the IDB-cached snapshot. The previous maxCacheAgeMs gate left
    // reloads sitting on a partial-sweep cache (AIS @ 5k vs server's
    // 15k, aircraft @ 290 vs server's 4943) for the entire setInterval
    // cycle — and on background tabs throttling stretched that to
    // minutes. maxCacheAgeMs is kept for getData()'s inline age
    // check, which still gates on-demand re-fetch decisions.
    if (this.cache) return { data: this.cache.data, stale: true };

    const persisted = await this.readPersistedCache();
    if (!persisted || persisted.data.length === 0) return null;

    const data = this.mergeFn
      ? this.mergeFn(persisted.data, [])
      : persisted.data;

    this.cache = { data, timestamp: persisted.timestamp };
    this.snapshot = {
      entities: data,
      version: this.snapshot.version + 1,
      lastUpdatedAt: persisted.timestamp,
      loading: true,
      error: null,
    };
    // Boot no longer batches via mute/unmute, so hydrate must announce the
    // cached snapshot itself — otherwise warm data wouldn't paint until the
    // network refresh lands.
    this.notifyChange();
    return { data, stale: true };
  }

  // ── Fetch ─────────────────────────────────────────────────────────

  async refresh(): Promise<DataPoint[]> {
    this.snapshot = { ...this.snapshot, loading: true, error: null };

    // Announce on every exit (success, soft-empty, or error) so a direct
    // boot refresh streams to the UI without going through getData().
    try {
      return await this.doRefresh();
    } finally {
      this.notifyChange();
    }
  }

  private async doRefresh(): Promise<DataPoint[]> {
    try {
      const incoming = await this.fetchFn();

      const merged = this.mergeFn
        ? this.mergeFn(this.cache?.data ?? [], incoming)
        : incoming;

      // Soft-error path: upstream returned 0 records (satellite down,
      // quota exhausted, temporary outage). Retain whatever we have and
      // treat it as a soft error. Skipped when allowEmptyResult is true
      // — for sources where empty is the legitimate truth (e.g. cyclones
      // out of season).
      if (merged.length === 0 && !this.allowEmptyResult) {
        const fallback = this.cache?.data ?? [];
        if (fallback.length > 0) {
          this.cache = { ...this.cache!, timestamp: Date.now() };
        }
        this.snapshot = {
          entities: fallback,
          version: this.snapshot.version + 1,
          lastUpdatedAt: Date.now(),
          loading: false,
          error: null,
        };
        return fallback;
      }

      // Diff incoming against the live cache: when id-set is unchanged,
      // mutate prior records in place and reuse the array reference.
      // Membership change → new array reference.
      const { entities } = diffAndApply<DataPoint>(
        this.cache?.data ?? null,
        merged,
      );
      this.cache = { data: entities, timestamp: Date.now() };
      this.persistCache(entities);
      this.snapshot = {
        entities,
        version: this.snapshot.version + 1,
        lastUpdatedAt: Date.now(),
        loading: false,
        error: null,
      };
      return entities;
    } catch (error) {
      const persisted = await this.readPersistedCache();
      const fallback = this.cache?.data ?? persisted?.data ?? [];
      this.snapshot = {
        entities: fallback,
        version: this.snapshot.version + 1,
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

  /**
   * Suspend onChange notifications. Returns a restore token that re-installs
   * the prior callback when passed to unmute(). Replaces the previous
   * `frontend.tsx` `_onChange` cast hack — see Hard Rule 12 in the spec.
   */
  mute(): () => void {
    const saved = this._onChange;
    this._onChange = null;
    return () => {
      this._onChange = saved;
    };
  }

  /** Restore notifications via the token from mute() and fire once. */
  unmute(restore: () => void): void {
    restore();
    this._onChange?.();
  }

  async getData(pollInterval?: number): Promise<DataPoint[]> {
    // 1. Memory cache hit — return immediately, maybe background refresh
    if (this.cache) {
      if (pollInterval && Date.now() - this.cache.timestamp > pollInterval) {
        if (!this.fetchInProgress) {
          this.fetchInProgress = this.refresh().finally(() => {
            this.fetchInProgress = null;
          });
        }
      }
      return this.cache.data;
    }

    // 2. No memory cache — go straight to network fetch.
    //    Background hydration (frontend.tsx) will push IDB data via
    //    notifyChange() if it arrives first. No blocking on dbReady.
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
