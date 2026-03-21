// ── News Provider ───────────────────────────────────────────────────
// Mirrors BaseProvider contract for NewsArticle[] (not DataPoint).
// hydrate / refresh / getData / getSnapshot — same lifecycle.
// IndexedDB persistence via storageService.

import { authenticatedFetch } from "@/lib/authService";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

// ── Types ───────────────────────────────────────────────────────────

export type NewsArticle = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description: string;
};

type NewsSnapshot = {
  items: NewsArticle[];
  error: Error | null;
  loading: boolean;
  lastUpdatedAt: number | null;
};

// ── Provider ────────────────────────────────────────────────────────

const NEWS_URL = "/api/news/latest";
const CACHE_KEY = CACHE_KEYS.news;
const MAX_CACHE_AGE_MS = 12 * 60 * 60_000; // 12 hours staleness

class NewsProvider {
  private cache: { data: NewsArticle[]; timestamp: number } | null = null;
  private snapshot: NewsSnapshot = {
    items: [],
    error: null,
    loading: false,
    lastUpdatedAt: null,
  };

  // ── Persistence ─────────────────────────────────────────────────

  private persistCache(data: NewsArticle[]): void {
    cacheSet(CACHE_KEY, { timestamp: Date.now(), data });
  }

  private async readPersistedCache(): Promise<{
    data: NewsArticle[];
    timestamp: number;
  } | null> {
    const cached = await cacheGet<{ data?: NewsArticle[]; timestamp?: number }>(
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

  async hydrate(): Promise<{ data: NewsArticle[]; stale: boolean } | null> {
    if (this.cache) return { data: this.cache.data, stale: false };

    const persisted = await this.readPersistedCache();
    if (!persisted || persisted.data.length === 0) return null;

    const stale = Date.now() - persisted.timestamp > MAX_CACHE_AGE_MS;

    this.cache = { data: persisted.data, timestamp: persisted.timestamp };
    this.snapshot = {
      items: persisted.data,
      lastUpdatedAt: persisted.timestamp,
      loading: stale,
      error: null,
    };
    return { data: persisted.data, stale };
  }

  // ── Fetch ───────────────────────────────────────────────────────

  async refresh(): Promise<NewsArticle[]> {
    this.snapshot = { ...this.snapshot, loading: true, error: null };

    try {
      const res = await authenticatedFetch(NEWS_URL);
      if (!res.ok) throw new Error(`News API error: ${res.status}`);

      const json = await res.json();
      if (!json || !Array.isArray(json.items)) {
        throw new Error("Invalid news response format");
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

  async getData(pollInterval?: number): Promise<NewsArticle[]> {
    if (this.cache) {
      if (pollInterval && Date.now() - this.cache.timestamp > pollInterval) {
        this.refresh().then(() => this.notifyChange()).catch(() => {});
      }
      return this.cache.data;
    }

    const hydrated = await this.hydrate();
    if (hydrated && hydrated.data.length > 0) {
      if (hydrated.stale) {
        this.refresh().then(() => this.notifyChange()).catch(() => {});
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
