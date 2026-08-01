import { Domain } from "@shared/domain/identity";
import { EMPTY_TEXT } from "@shared/text";

import type { DataPoint } from "@/features/base/dataPoints";
import {
  ACTIVE_BASINS,
  CycloneBasin,
  type NhcBasin,
} from "@shared/cyclonesSeason";
import {
  Category,
  HURRICANE_CATEGORY,
  SaffirSimpson,
  type CycloneData,
  type ForecastPoint,
  type GeoJSONPolygon,
  type ModelTrack,
  type PastTrackPoint,
  type WindRadii,
} from "../types";
import { authenticatedFetch } from "@/lib/net/authService";
import { CycloneWindThreshold, saffirSimpson } from "../classification";

export enum CycloneDataEndpoint {
  Latest = "/api/cyclones/latest",
}

enum NhcClassificationPrefix {
  Subtropical = "S",
}

enum CycloneFetchErrorKind {
  HttpStatus = "Cyclone source request failed",
}

export class CycloneFetchError extends Error {
  constructor(
    readonly kind: CycloneFetchErrorKind,
    readonly status: number,
  ) {
    super(kind);
    this.name = CycloneFetchError.name;
  }
}

enum NhcForecastHour {
  H12 = 12,
  H24 = 24,
  H36 = 36,
  H48 = 48,
  H72 = 72,
  H96 = 96,
  H120 = 120,
}

const TRACK_ERROR_NM: ReadonlyMap<NhcForecastHour, number> = new Map([
  [NhcForecastHour.H12, 26],
  [NhcForecastHour.H24, 41],
  [NhcForecastHour.H36, 55],
  [NhcForecastHour.H48, 70],
  [NhcForecastHour.H72, 100],
  [NhcForecastHour.H96, 138],
  [NhcForecastHour.H120, 178],
]);

enum NhcTrackError {
  NotPublished = 0,
}

function trackErrorNm(fcstHour: number): number {
  return (
    TRACK_ERROR_NM.get(fcstHour as NhcForecastHour) ??
    NhcTrackError.NotPublished
  );
}

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
  // The server attaches these values after it reads the NHC payload.
  forecast?: NhcForecastPoint[];
  officialCone?: GeoJSONPolygon;
  windRadii?: WindRadii;
  pastTrack?: PastTrackPoint[];
  models?: ModelTrack[];
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
): { category: Category; saffirSimpson: SaffirSimpson } {
  if (classification === Category.PostTropical) {
    return {
      category: Category.PostTropical,
      saffirSimpson: SaffirSimpson.None,
    };
  }
  const subtropical = classification.startsWith(
    NhcClassificationPrefix.Subtropical,
  );
  const scale = saffirSimpson(maxWindKt);
  if (scale !== SaffirSimpson.None) {
    return { category: HURRICANE_CATEGORY[scale], saffirSimpson: scale };
  }
  if (maxWindKt >= CycloneWindThreshold.TropicalStorm) {
    return {
      category: subtropical
        ? Category.SubtropicalStorm
        : Category.TropicalStorm,
      saffirSimpson: SaffirSimpson.None,
    };
  }
  return {
    category: subtropical
      ? Category.SubtropicalDepression
      : Category.TropicalDepression,
    saffirSimpson: SaffirSimpson.None,
  };
}

export function basinFromId(id: string): NhcBasin {
  const prefix = id.slice(0, 2).toUpperCase();
  const basin = ACTIVE_BASINS.find((candidate) => candidate === prefix);
  return basin ?? CycloneBasin.CentralPacific;
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
    errorRadiusNm: trackErrorNm(p.fcstHour),
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

  const minPressureRaw = s.pressure ? Number.parseFloat(s.pressure) : Number.NaN;
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
      s.publicAdvisory?.advNum ??
      s.forecastTrack?.advisoryNumber ??
      EMPTY_TEXT,
    lastUpdate: s.lastUpdate,
    forecast: (s.forecast ?? []).map(toForecastPoint),
    // The worker synthesizes the cone when this value is absent.
    officialCone: s.officialCone,
    // Absent for storms NHC reports no wind radii for (weak depressions).
    windRadii: s.windRadii,
    // Observed best-track history (genesis → now); absent until b-deck fetched.
    pastTrack: s.pastTrack,
    // Per-model spaghetti tracks; absent until a-deck fetched.
    models: s.models,
  };

  const point: DataPoint = {
    id: `CY${s.id.toUpperCase()}`,
    type: Domain.Cyclones,
    lat: s.latitudeNumeric,
    lon: s.longitudeNumeric,
    timestamp: s.lastUpdate,
    data,
  };
  return point;
}

export async function fetchCurrentStorms(): Promise<DataPoint[]> {
  const res = await authenticatedFetch(CycloneDataEndpoint.Latest);
  if (!res.ok) {
    throw new CycloneFetchError(CycloneFetchErrorKind.HttpStatus, res.status);
  }
  const json = (await res.json()) as NhcResponse;
  const storms = json.activeStorms ?? [];
  const out: DataPoint[] = [];
  for (const s of storms) {
    const pt = toDataPoint(s);
    if (pt) out.push(pt);
  }
  return out;
}
