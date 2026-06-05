import { type DataPoint } from "@/features/base/dataPoints";
import {
  type DataProvider,
  type ProviderSnapshot,
} from "@/features/base/types";
import { generateMockAircraft } from "@/data/mockData";
import { getSquawkStatus, normalizeIcao24 } from "../lib/utils";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";
import { fetchAircraftStates } from "./parseAdsbV2";
import { diffAndApply } from "@/features/base/diffEntities";

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
    version: 0,
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
      version: this.snapshot.version + 1,
      lastUpdatedAt: Date.now(),
      loading: false,
      error: null,
    };
    this.notifyChange();
  }

  private async fetchAircraftStates(): Promise<DataPoint[]> {
    // The server cache (src/server/api/aircraftCache.ts) already enriched
    // each record with acType / registration / military / etc. via the
    // local NDJSON metadata DB before the response left the wire — the
    // client side is now a pure shape mapper. We still derive squawkStatus
    // (it's a local UI-only enum, not metadata) and normalise icao24.
    //
    // Persistence intentionally lives in refresh(), AFTER the empty-
    // protection check, so a cold-start ac:[] response from the server
    // never poisons IDB with `{ data: [] }`. Documented invariant in
    // docs/caching.md "Client-Side Stale Cache Retention".
    const aircraft = await fetchAircraftStates();
    return aircraft.map((entity) => {
      if (entity.type !== "aircraft") return entity;
      const d = entity.data as { squawk?: string; icao24?: string };
      const norm = normalizeIcao24(d.icao24);
      return {
        ...entity,
        data: {
          ...d,
          icao24: norm && norm !== d.icao24 ? norm : d.icao24,
          squawkStatus: getSquawkStatus(d.squawk),
        },
      } as DataPoint;
    });
  }

  async hydrate(): Promise<{ data: DataPoint[]; stale: boolean } | null> {
    await this.hydrateMemoryCacheFromPersisted();
    if (!this.cache) return null;
    // Always mark stale so the boot sequence triggers a background
    // refresh in addition to showing the IDB-cached snapshot. Aircraft
    // data is the most volatile layer in the app and the previous
    // 30-min freshness window let user reloads sit on stale snapshots
    // (e.g. an early-sweep partial of ~290 records) for the entire
    // setInterval cycle. cacheDurationMs is kept for the existing
    // getData() age check, which still gates inline re-fetch decisions.
    return { data: this.cache.data, stale: true };
  }

  async refresh(): Promise<DataPoint[]> {
    this.snapshot = { ...this.snapshot, loading: true, error: null };
    try {
      return await this.doRefresh();
    } finally {
      this.notifyChange();
    }
  }

  private async doRefresh(): Promise<DataPoint[]> {
    try {
      const incoming = await this.fetchAircraftStates();
      // Server returns ac:[] during cold-start (sweep in flight) — see
      // src/server/api/index.ts /api/aircraft/states. Don't blank a
      // populated cache with that transient empty: keep showing the
      // last known snapshot until the next poll lands real data.
      // Mirrors the firmsCache.ts stale-protect on the server.
      if (incoming.length === 0 && this.cache && this.cache.data.length > 0) {
        this.snapshot = {
          ...this.snapshot,
          version: this.snapshot.version + 1,
          loading: false,
          error: null,
        };
        return this.cache.data;
      }
      // Diff incoming against the live cache: same id-set → mutate prior
      // records in place and reuse the array reference. Different id-set
      // → new array reference. See diffEntities.ts.
      const { entities } = diffAndApply<DataPoint>(
        this.cache?.data ?? null,
        incoming,
      );
      this.cache = { data: entities, timestamp: Date.now() };
      // Only persist non-empty results — never poison IDB with
      // `{ data: [] }` (would trip the cacheInit poisoned-cache purge
      // on next reload, defeating the empty-protect pattern documented
      // in docs/caching.md "Client-Side Stale Cache Retention").
      if (entities.length > 0) this.persistCache(entities);
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
      const fallback =
        this.cache?.data ?? persisted?.data ?? generateMockAircraft();
      if (this.cache) {
        this.cache = { ...this.cache, timestamp: Date.now() };
      } else if (persisted?.data) {
        this.cache = { data: persisted.data, timestamp: Date.now() };
      }
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

  /** Mirror BaseProvider.mute() — see types.ts DataProvider contract. */
  mute(): () => void {
    const saved = this._onChange;
    this._onChange = null;
    return () => {
      this._onChange = saved;
    };
  }

  /** Mirror BaseProvider.unmute() — restore + fire once. */
  unmute(restore: () => void): void {
    restore();
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
        this.fetchInProgress = this.refresh().finally(() => {
          this.fetchInProgress = null;
        });
      }
      return this.cache.data;
    }

    // No cache yet — fetch immediately, don't block on IDB
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

  /** No-op shim. Server-side enrichment runs once per sweep before the
   *  cache is even written, so by the time the client receives an
   *  aircraft record it already has acType / registration / military /
   *  etc. attached. DataContext still calls this on selection — keeping
   *  the contract returning null avoids touching the call sites. */
  async enrichAircraftByIcao24(
    _icao24List: string[],
  ): Promise<DataPoint[] | null> {
    return null;
  }
}
