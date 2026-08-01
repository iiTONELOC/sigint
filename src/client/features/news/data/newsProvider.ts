import { authenticatedFetch } from "@/lib/net/authService";
import { cacheGet, cacheSet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";

export type NewsArticle = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly source: string;
  readonly publishedAt: string;
  readonly description: string;
}>;

type NewsSnapshot = Readonly<{
  readonly items: readonly NewsArticle[];
  readonly error: Error | null;
  readonly loading: boolean;
  readonly lastUpdatedAt: number | null;
}>;

enum NewsEndpoint {
  Latest = "/api/news/latest",
}

enum NewsTiming {
  MaximumCacheAgeMs = 43_200_000,
}

enum NewsProviderErrorKind {
  InvalidResponse = "The news response format is invalid",
  RequestRejected = "The news request failed",
  Unknown = "The news request failed for an unknown reason",
}

class NewsProviderError extends Error {
  constructor(
    readonly kind: NewsProviderErrorKind,
    readonly httpStatus: number | null = null,
  ) {
    super(kind);
    this.name = NewsProviderError.name;
  }
}

class NewsProvider {
  private cache: { data: NewsArticle[]; timestamp: number } | null = null;
  private snapshot: NewsSnapshot = {
    items: [],
    error: null,
    loading: false,
    lastUpdatedAt: null,
  };

  private persistCache(data: NewsArticle[]): void {
    cacheSet(CacheKey.News, { timestamp: Date.now(), data });
  }

  private async readPersistedCache(): Promise<{
    data: NewsArticle[];
    timestamp: number;
  } | null> {
    const cached = await cacheGet<{ data?: NewsArticle[]; timestamp?: number }>(
      CacheKey.News,
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

  async hydrate(): Promise<{ data: NewsArticle[]; stale: boolean } | null> {
    if (this.cache) return { data: this.cache.data, stale: false };

    const persisted = await this.readPersistedCache();
    if (!persisted || persisted.data.length === 0) return null;

    const stale =
      Date.now() - persisted.timestamp > NewsTiming.MaximumCacheAgeMs;

    this.cache = { data: persisted.data, timestamp: persisted.timestamp };
    this.snapshot = {
      items: persisted.data,
      lastUpdatedAt: persisted.timestamp,
      loading: stale,
      error: null,
    };
    this.notifyChange();
    return { data: persisted.data, stale };
  }

  async refresh(): Promise<NewsArticle[]> {
    this.snapshot = { ...this.snapshot, loading: true, error: null };
    try {
      return await this.doRefresh();
    } finally {
      this.notifyChange();
    }
  }

  private async doRefresh(): Promise<NewsArticle[]> {
    try {
      const res = await authenticatedFetch(NewsEndpoint.Latest);
      if (!res.ok) {
        throw new NewsProviderError(
          NewsProviderErrorKind.RequestRejected,
          res.status,
        );
      }

      const json = await res.json();
      if (!json || !Array.isArray(json.items)) {
        throw new NewsProviderError(NewsProviderErrorKind.InvalidResponse);
      }

      const data = json.items as NewsArticle[];
      this.cache = { data, timestamp: Date.now() };
      this.persistCache(data);
      this.snapshot = {
        items: data,
        lastUpdatedAt: Date.now(),
        loading: false,
        error: null,
      };
      return data;
    } catch (error) {
      const persisted = await this.readPersistedCache();
      const fallback = this.cache?.data ?? persisted?.data ?? [];
      this.snapshot = {
        items: fallback,
        lastUpdatedAt: Date.now(),
        loading: false,
        error: error instanceof Error
          ? error
          : new NewsProviderError(NewsProviderErrorKind.Unknown),
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

  /** Pause change notifications and return a restore action. */
  mute(): () => void {
    const saved = this._onChange;
    this._onChange = null;
    return () => {
      this._onChange = saved;
    };
  }

  /** Restore change notifications and publish the current snapshot. */
  unmute(restore: () => void): void {
    restore();
    this._onChange?.();
  }

  async getData(pollInterval?: number): Promise<NewsArticle[]> {
    if (this.cache) {
      if (pollInterval && Date.now() - this.cache.timestamp > pollInterval) {
        this.refresh();
      }
      return this.cache.data;
    }

    const hydrated = await this.hydrate();
    if (hydrated && hydrated.data.length > 0) {
      if (hydrated.stale) {
        this.refresh();
      }
      return hydrated.data;
    }

    return this.refresh();
  }

  getSnapshot(): NewsSnapshot {
    return this.snapshot;
  }
}

export const newsProvider = new NewsProvider();
