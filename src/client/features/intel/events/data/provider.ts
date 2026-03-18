import type { DataPoint } from "@/features/base/dataPoints";
import type { DataProvider, ProviderSnapshot } from "@/features/base/types";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { authenticatedFetch } from "@/lib/authService";

// ── Server endpoint ──────────────────────────────────────────────────
// Client fetches from our server (which caches GDELT data).
// Auth via server-issued token fetched on boot.

const EVENTS_URL = "/api/events/latest";

const CACHE_KEY = "sigint.gdelt.events-cache.v1";
const MAX_CACHE_AGE_MS = 30 * 60_000; // 30 min — reject stale on hydrate
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60_000; // 7 days — rolling window

// ── GDELT GeoJSON shape ─────────────────────────────────────────────

type GdeltFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    name?: string;
    html?: string;
    url?: string;
    urltone?: string;
    urlpubtimedate?: string;
    urlsocialimage?: string;
    urllang?: string;
    urlsourcecountry?: string;
    domain?: string;
    // Extra fields from our server's export CSV parsing
    severity?: number;
    category?: string;
    goldstein?: number;
    mentions?: number;
    actor1?: string;
    actor2?: string;
    eventCode?: string;
  };
};

type GdeltResponse = {
  type: "FeatureCollection";
  features: GdeltFeature[];
};

type ServerResponse = {
  data: GdeltResponse;
  fetchedAt: number;
  error?: string;
};

// ── Helpers ─────────────────────────────────────────────────────────

function toneToCategorySeverity(tone: number): {
  category: string;
  severity: number;
} {
  if (tone <= -15) return { category: "Crisis", severity: 5 };
  if (tone <= -10) return { category: "Conflict", severity: 4 };
  if (tone <= -5) return { category: "Tension", severity: 3 };
  if (tone <= -1) return { category: "Concern", severity: 2 };
  return { category: "Monitoring", severity: 1 };
}

function extractTitle(html?: string, url?: string): string {
  if (html) {
    const match = html.match(/>([^<]+)</);
    if (match?.[1]) return match[1].trim();
  }
  return url ?? "Unknown Event";
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

function toDataPoint(f: GdeltFeature, idx: number): DataPoint | null {
  const coords = f.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;

  const [lon, lat] = coords;
  if (lat == null || lon == null) return null;

  const props = f.properties ?? {};
  const tone = props.urltone ? parseFloat(props.urltone) : 0;

  // Use server-computed severity/category if available, else derive from tone
  const severity = props.severity ?? toneToCategorySeverity(tone).severity;
  const category = props.category ?? toneToCategorySeverity(tone).category;

  const headline = extractTitle(props.html, props.url);

  const id = props.url
    ? `GE${hashString(props.url)}`
    : `GE${idx}-${Date.now()}`;

  const timestamp = props.urlpubtimedate
    ? new Date(props.urlpubtimedate).toISOString()
    : new Date().toISOString();

  return {
    id,
    type: "events" as const,
    lat,
    lon,
    timestamp,
    data: {
      headline,
      snippet: undefined,
      category,
      source: props.domain ?? undefined,
      sourceDomain: props.domain ?? undefined,
      sourceCountry: props.urlsourcecountry ?? undefined,
      language: props.urllang ?? undefined,
      url: props.url ?? undefined,
      imageUrl: props.urlsocialimage ?? undefined,
      tone: isFinite(tone) ? tone : undefined,
      severity,
      locationName: props.name ?? undefined,
    },
  } as DataPoint;
}

// ── Provider ────────────────────────────────────────────────────────

export class GdeltProvider implements DataProvider<DataPoint> {
  readonly id = "gdelt-events";
  private cache: { data: DataPoint[]; timestamp: number } | null = null;
  private knownUrls = new Set<string>();

  private snapshot: ProviderSnapshot<DataPoint> = {
    entities: [],
    error: null,
    loading: false,
    lastUpdatedAt: null,
  };

  // ── Persistence ───────────────────────────────────────────────────

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

  // ── Dedup + expiry ────────────────────────────────────────────────

  private mergeAndPrune(
    existing: DataPoint[],
    incoming: DataPoint[],
  ): DataPoint[] {
    const now = Date.now();
    const byUrl = new Map<string, DataPoint>();

    for (const item of existing) {
      if (item.timestamp) {
        const age = now - new Date(item.timestamp).getTime();
        if (age > MAX_EVENT_AGE_MS) continue;
      }
      // @ts-ignore
      const url = item.data?.url;
      if (url) {
        byUrl.set(url, item);
        this.knownUrls.add(url);
      } else {
        byUrl.set(item.id, item);
      }
    }

    for (const item of incoming) {
      // @ts-ignore
      const url = item.data?.url;
      if (url) {
        if (!byUrl.has(url)) {
          byUrl.set(url, item);
          this.knownUrls.add(url);
        }
      } else {
        byUrl.set(item.id, item);
      }
    }

    return Array.from(byUrl.values());
  }

  // ── Hydrate ───────────────────────────────────────────────────────

  hydrate(): DataPoint[] | null {
    if (this.cache) return this.cache.data;

    const persisted = this.readPersistedCache();
    if (!persisted || persisted.data.length === 0) return null;
    if (Date.now() - persisted.timestamp > MAX_CACHE_AGE_MS) return null;

    const pruned = this.mergeAndPrune(persisted.data, []);
    this.cache = { data: pruned, timestamp: persisted.timestamp };
    this.snapshot = {
      entities: pruned,
      lastUpdatedAt: persisted.timestamp,
      loading: false,
      error: null,
    };
    return pruned;
  }

  // ── Fetch ─────────────────────────────────────────────────────────

  async refresh(): Promise<DataPoint[]> {
    this.snapshot = { ...this.snapshot, loading: true, error: null };

    try {
      const response = await authenticatedFetch(EVENTS_URL);

      if (!response.ok) {
        throw new Error(`Events API error: ${response.status}`);
      }

      const json: ServerResponse = await response.json();
      const raw = json.data;

      if (!raw?.features || !Array.isArray(raw.features)) {
        throw new Error("Invalid GDELT response format");
      }

      const incoming: DataPoint[] = [];
      for (let i = 0; i < raw.features.length; i++) {
        const point = toDataPoint(raw.features[i]!, i);
        if (point) incoming.push(point);
      }

      const existing = this.cache?.data ?? [];
      const merged = this.mergeAndPrune(existing, incoming);

      this.cache = { data: merged, timestamp: Date.now() };
      this.persistCache(merged);
      this.snapshot = {
        entities: merged,
        lastUpdatedAt: Date.now(),
        loading: false,
        error: null,
      };
      return merged;
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
      // If cache is older than poll interval, kick off background refresh
      // so next read gets fresh data — but return cached data immediately
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
