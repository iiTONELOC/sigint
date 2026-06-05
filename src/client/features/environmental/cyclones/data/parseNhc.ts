// ── NHC CurrentStorms.json parser ────────────────────────────────────
// Fetches from the same-origin server proxy (/api/cyclones/latest), never
// from nhc.noaa.gov directly — the NHC endpoint sends no CORS headers.
// The server route is hardcoded in the cyclones cache module (A10 SSRF
// guard: no client input flows into any outbound URL).

import type { DataPoint } from "@/features/base/dataPoints";
import type {
  CycloneData,
  ForecastPoint,
  Category,
  GeoJSONPolygon,
} from "../types";
import { authenticatedFetch } from "@/lib/authService";

const CYCLONES_URL = "/api/cyclones/latest";

// NHC 5-year average track error radii in nautical miles, by forecast hour.
// Source: https://www.nhc.noaa.gov/verification/verify5.shtml
const TRACK_ERROR_NM: Record<number, number> = {
  12: 26,
  24: 41,
  36: 55,
  48: 70,
  72: 100,
  96: 138,
  120: 178,
};

type NhcResponse = { activeStorms?: NhcStorm[] };

type NhcStorm = {
  id: string;
  binNumber?: string;
  name: string;
  classification: string;
  intensity: string;
  pressure?: string;
  latitudeNumeric: number;
  longitudeNumeric: number;
  movementDir?: number;
  movementSpeed?: number;
  lastUpdate: string;
  // Per the 2019 NHC CurrentStorms.json schema reference, each storm
  // carries direct URLs for its current text products and the 5-day
  // cone KMZ. Schema correction: the cone KMZ lives on `trackCone`,
  // not `forecastTrack` (forecastTrack is the track-line graphic, a
  // separate product). publicAdvisory / forecastDiscussion /
  // windSpeedProbabilities are read by the server-side dossier cache.
  publicAdvisory?: { advNum?: string; issuance?: string; url?: string };
  forecastDiscussion?: { advNum?: string; issuance?: string; url?: string };
  windSpeedProbabilities?: { advNum?: string; issuance?: string; url?: string };
  trackCone?: { advNum?: string; issuance?: string; kmzFile?: string };
  forecastTrack?: {
    advisoryNumber?: string;
    kmzFile?: string;
    zipFile?: string;
  };
  // Attached server-side (enrichStorms) — not present in raw NHC payloads.
  forecast?: NhcForecastPoint[];
  officialCone?: GeoJSONPolygon;
};

type NhcForecastPoint = {
  fcstHour: number;
  validTime: string;
  latitude: number;
  longitude: number;
  maxWind: number;
  minPressure?: number;
  development?: string;
};

export function classify(
  classification: string,
  maxWindKt: number,
): { category: Category; saffirSimpson: 0 | 1 | 2 | 3 | 4 | 5 } {
  if (classification === "PT") return { category: "PT", saffirSimpson: 0 };
  const sub = classification.startsWith("S");
  if (maxWindKt >= 137) return { category: "HU5", saffirSimpson: 5 };
  if (maxWindKt >= 113) return { category: "HU4", saffirSimpson: 4 };
  if (maxWindKt >= 96) return { category: "HU3", saffirSimpson: 3 };
  if (maxWindKt >= 83) return { category: "HU2", saffirSimpson: 2 };
  if (maxWindKt >= 64) return { category: "HU1", saffirSimpson: 1 };
  if (maxWindKt >= 34)
    return { category: sub ? "STS" : "TS", saffirSimpson: 0 };
  return { category: sub ? "STD" : "TD", saffirSimpson: 0 };
}

export function basinFromId(id: string): "AL" | "EP" | "CP" {
  const prefix = id.slice(0, 2).toUpperCase();
  if (prefix === "AL") return "AL";
  if (prefix === "EP") return "EP";
  return "CP";
}

function toForecastPoint(p: NhcForecastPoint): ForecastPoint {
  const wind = p.maxWind;
  const { category } = classify(p.development ?? "", wind);
  return {
    fcstHour: p.fcstHour,
    validTime: p.validTime,
    lat: p.latitude,
    lon: p.longitude,
    maxWindKt: wind,
    minPressureMb: p.minPressure,
    category,
    errorRadiusNm: TRACK_ERROR_NM[p.fcstHour] ?? 0,
  };
}

function toDataPoint(s: NhcStorm): DataPoint | null {
  if (
    typeof s.latitudeNumeric !== "number" ||
    typeof s.longitudeNumeric !== "number"
  ) {
    return null;
  }
  const maxWindKt = Number.parseFloat(s.intensity);
  if (!Number.isFinite(maxWindKt)) return null;

  const minPressureRaw = s.pressure ? Number.parseFloat(s.pressure) : NaN;
  const minPressureMb = Number.isFinite(minPressureRaw)
    ? minPressureRaw
    : undefined;
  const { category, saffirSimpson } = classify(s.classification, maxWindKt);

  const data: CycloneData = {
    stormId: s.id.toUpperCase(),
    name: s.name,
    basin: basinFromId(s.id),
    classification: category,
    saffirSimpson,
    maxWindKt,
    minPressureMb,
    movementDir: s.movementDir,
    movementSpeedKt: s.movementSpeed,
    // Per 2019 schema, publicAdvisory.advNum is the canonical advisory
    // identifier; fall back to forecastTrack.advisoryNumber for older
    // payload shapes (and existing test fixtures that pre-date the
    // schema correction).
    advisoryNumber:
      s.publicAdvisory?.advNum ?? s.forecastTrack?.advisoryNumber ?? "",
    lastUpdate: s.lastUpdate,
    forecast: (s.forecast ?? []).map(toForecastPoint),
    // Absent if the cone fetch failed — worker falls back to a synthesized cone.
    officialCone: s.officialCone,
  };

  return {
    id: `CY${s.id.toUpperCase()}`,
    type: "cyclones" as const,
    lat: s.latitudeNumeric,
    lon: s.longitudeNumeric,
    timestamp: s.lastUpdate,
    data,
  } as DataPoint;
}

export async function fetchCurrentStorms(): Promise<DataPoint[]> {
  const res = await authenticatedFetch(CYCLONES_URL);
  if (!res.ok) throw new Error(`/api/cyclones/latest: ${res.status}`);
  const json = (await res.json()) as NhcResponse;
  const storms = json.activeStorms ?? [];
  const out: DataPoint[] = [];
  for (const s of storms) {
    const pt = toDataPoint(s);
    if (pt) out.push(pt);
  }
  return out;
}
