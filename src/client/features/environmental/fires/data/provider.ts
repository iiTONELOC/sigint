import type { DataPoint } from "@/features/base/dataPoints";
import { BaseProvider } from "@/features/base/BaseProvider";
import { authenticatedFetch } from "@/lib/authService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

const FIRES_URL = "/api/fires/latest";

// ── Server response shape ────────────────────────────────────────────

type ServerFire = {
  lat: number;
  lon: number;
  brightness: number;
  scan: number;
  track: number;
  acqDate: string;
  acqTime: string;
  satellite: string;
  instrument: string;
  confidence: string;
  version: string;
  brightT31: number;
  frp: number;
  daynight: string;
};

type ServerResponse = {
  data: ServerFire[];
  fetchedAt: number;
  fireCount: number;
};

// ── Helpers ──────────────────────────────────────────────────────────

function parseAcqTimestamp(acqDate: string, acqTime: string): string {
  if (!acqDate) return new Date().toISOString();
  const hh = acqTime.slice(0, 2) || "00";
  const mm = acqTime.slice(2, 4) || "00";
  try {
    return new Date(`${acqDate}T${hh}:${mm}:00Z`).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function toDataPoint(f: ServerFire, idx: number): DataPoint | null {
  if (f.lat == null || f.lon == null) return null;
  if (f.lat === 0 && f.lon === 0) return null;

  return {
    id: `FI${idx}-${Math.round(f.lat * 1000)}-${Math.round(f.lon * 1000)}`,
    type: "fires" as const,
    lat: f.lat,
    lon: f.lon,
    timestamp: parseAcqTimestamp(f.acqDate, f.acqTime),
    data: {
      brightness: f.brightness,
      frp: f.frp,
      confidence: f.confidence,
      satellite: f.satellite,
      instrument: f.instrument,
      scan: f.scan,
      track: f.track,
      brightT31: f.brightT31,
      daynight: f.daynight,
      acqDate: f.acqDate,
      acqTime: f.acqTime,
    },
  } as DataPoint;
}

// ── Fetch logic ──────────────────────────────────────────────────────

async function fetchFires(): Promise<DataPoint[]> {
  const response = await authenticatedFetch(FIRES_URL);

  if (!response.ok) {
    throw new Error(`Fires API error: ${response.status}`);
  }

  const json: ServerResponse = await response.json();

  if (!json.data || !Array.isArray(json.data)) {
    throw new Error("Invalid fires response format");
  }

  const data: DataPoint[] = [];
  for (let i = 0; i < json.data.length; i++) {
    const point = toDataPoint(json.data[i]!, i);
    if (point) data.push(point);
  }
  return data;
}

// ── Provider instance ────────────────────────────────────────────────

export const fireProvider = new BaseProvider({
  id: "firms-fires",
  cacheKey: CACHE_KEYS.fires,
  maxCacheAgeMs: 30 * 60_000,
  fetchFn: fetchFires,
});
