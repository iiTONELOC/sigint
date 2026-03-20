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

  async hydrate(): Promise<NewsArticle[] | null> {
    if (this.cache) return this.cache.data;

    const persisted = await this.readPersistedCache();
    if (!persisted || persisted.data.length === 0) return null;
    if (Date.now() - persisted.timestamp > MAX_CACHE_AGE_MS) return null;

    this.cache = { data: persisted.data, timestamp: persisted.timestamp };
    this.snapshot = {
      items: persisted.data,
      lastUpdatedAt: persisted.timestamp,
      loading: false,
      error: null,
    };
    return persisted.data;
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

  async getData(pollInterval?: number): Promise<NewsArticle[]> {
    if (this.cache) {
      if (pollInterval && Date.now() - this.cache.timestamp > pollInterval) {
        this.refresh().catch(() => {});
      }
      return this.cache.data;
    }

    // Try async hydration first
    const hydrated = await this.hydrate();
    if (hydrated && hydrated.length > 0) {
      return hydrated;
    }

    return this.refresh();
  }

  getSnapshot(): NewsSnapshot {
    return this.snapshot;
  }
}

export const newsProvider = new NewsProvider();
