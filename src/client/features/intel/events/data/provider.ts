import type { DataPoint } from "@/features/base/dataPoints";
import { BaseProvider } from "@/features/base/BaseProvider";
import { authenticatedFetch } from "@/lib/authService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

const EVENTS_URL = "/api/events/latest";
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

// ── Dedup + expiry ──────────────────────────────────────────────────

function mergeAndPrune(
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
      }
    } else {
      byUrl.set(item.id, item);
    }
  }

  return Array.from(byUrl.values());
}

// ── Fetch logic ─────────────────────────────────────────────────────

async function fetchEvents(): Promise<DataPoint[]> {
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
  return incoming;
}

// ── Provider instance ────────────────────────────────────────────────

export const gdeltProvider = new BaseProvider({
  id: "gdelt-events",
  cacheKey: CACHE_KEYS.events,
  maxCacheAgeMs: 30 * 60_000,
  fetchFn: fetchEvents,
  mergeFn: mergeAndPrune,
});
