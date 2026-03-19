import type { DataPoint } from "@/features/base/dataPoints";
import { BaseProvider } from "@/features/base/BaseProvider";
import { CACHE_KEYS } from "@/lib/cacheKeys";

const FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson";

// ── USGS response types ──────────────────────────────────────────────

type USGSFeature = {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    felt: number | null;
    tsunami: number;
    alert: string | null;
    sig: number;
    magType: string | null;
    type: string;
    status: string;
    url: string;
  };
  geometry: {
    coordinates: [number, number, number]; // [lon, lat, depth]
  };
};

type USGSResponse = {
  features: USGSFeature[];
};

// ── Transform ────────────────────────────────────────────────────────

function toDataPoint(f: USGSFeature): DataPoint | null {
  const [lon, lat, depth] = f.geometry.coordinates;
  if (lat == null || lon == null) return null;

  return {
    id: `Q${f.id}`,
    type: "quakes" as const,
    lat,
    lon,
    timestamp: new Date(f.properties.time).toISOString(),
    data: {
      magnitude: f.properties.mag ?? undefined,
      depth: depth ?? undefined,
      location: f.properties.place ?? undefined,
      felt: f.properties.felt ?? undefined,
      tsunami: f.properties.tsunami === 1,
      alert: f.properties.alert ?? undefined,
      significance: f.properties.sig ?? undefined,
      magType: f.properties.magType ?? undefined,
      eventType: f.properties.type ?? undefined,
      url: f.properties.url ?? undefined,
      status: f.properties.status ?? undefined,
    },
  } as DataPoint;
}

// ── Fetch logic ──────────────────────────────────────────────────────

async function fetchEarthquakes(): Promise<DataPoint[]> {
  const response = await fetch(FEED_URL);
  if (!response.ok) {
    throw new Error(`USGS API error: ${response.status}`);
  }

  const raw: USGSResponse = await response.json();
  if (!raw.features || !Array.isArray(raw.features)) {
    throw new Error("Invalid USGS response format");
  }

  const data: DataPoint[] = [];
  for (const f of raw.features) {
    const point = toDataPoint(f);
    if (point) data.push(point);
  }
  return data;
}

// ── Provider instance ────────────────────────────────────────────────

export const earthquakeProvider = new BaseProvider({
  id: "earthquake",
  cacheKey: CACHE_KEYS.earthquake,
  maxCacheAgeMs: 30 * 60_000,
  fetchFn: fetchEarthquakes,
});
