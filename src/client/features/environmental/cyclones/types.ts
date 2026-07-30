import type { GeoJsonPolygon } from "@shared/geo";

// ── Cyclone feature types ────────────────────────────────────────────
// Shape of NHC tropical-cyclone data once parseNhc.ts has normalized it
// into the SIGINT DataPoint union.

export type Category =
  | "TD" // tropical depression
  | "TS" // tropical storm
  | "HU1"
  | "HU2"
  | "HU3"
  | "HU4"
  | "HU5"
  | "STD" // subtropical depression
  | "STS" // subtropical storm
  | "PT"; // post-tropical

export type ForecastPoint = {
  /** Hours from current advisory time. NHC publishes 12, 24, 36, 48, 72, 96, 120. */
  fcstHour: number;
  /** ISO timestamp at that forecast point */
  validTime: string;
  lat: number;
  lon: number;
  /** Max sustained winds in knots */
  maxWindKt: number;
  /** Min central pressure in mb */
  minPressureMb?: number;
  /** Saffir-Simpson category at this forecast point */
  category: Category;
  /** NHC 5-yr average track error radius (nautical miles) for this fcstHour */
  errorRadiusNm: number;
};

export type CycloneData = {
  /** NHC storm ID, uppercased — e.g. "AL052026" */
  stormId: string;
  /** Storm name — "ELENA" */
  name: string;
  /** Basin: AL=Atlantic, EP=East Pacific, CP=Central Pacific */
  basin: "AL" | "EP" | "CP";
  /** Current classification at advisory time */
  classification: Category;
  /** Saffir-Simpson 1-5 (HU only), 0 for non-HU */
  saffirSimpson: 0 | 1 | 2 | 3 | 4 | 5;
  /** Max sustained winds at current position, in knots */
  maxWindKt: number;
  /** Min central pressure, in mb */
  minPressureMb?: number;
  /** Movement direction in degrees (0=N, 90=E) */
  movementDir?: number;
  /** Movement speed in knots */
  movementSpeedKt?: number;
  /** Latest advisory number — e.g. "12A" */
  advisoryNumber: string;
  /** ISO time of last advisory */
  lastUpdate: string;
  /** Forecast track points. Empty array if NHC didn't include inline forecast. */
  forecast: ForecastPoint[];
  /** Official NHC 5-day cone polygon as GeoJSON. Populated lazily from
   *  /api/cyclones/:stormId/cone after CurrentStorms.json parse. Absent
   *  → worker falls back to the synthesized error-radius cone. */
  officialCone?: GeoJSONPolygon;
  /** Current 34/50/64-kt wind radii from the ATCF b-deck (real analyzed storm
   *  size). Attached server-side; absent for storms NHC reports no radii for. */
  windRadii?: WindRadii;
  /** Observed best-track history (genesis → now) from the ATCF b-deck. Absent
   *  until the b-deck is fetched. */
  pastTrack?: PastTrackPoint[];
  /** Per-model spaghetti tracks from the ATCF a-deck. Attached server-side like
   *  windRadii/pastTrack; ride on the storm so the globe draws them under the
   *  MODELS toggle without a separate fetch. Absent until the a-deck is fetched. */
  models?: ModelTrack[];
};

/** One analyzed past position from the ATCF best track. */
export type PastTrackPoint = {
  lat: number;
  lon: number;
  validTime: string;
  vmaxKt: number;
  minPressureMb?: number | null;
};

/** A single model's forecast track from the a-deck (spaghetti). */
export type ModelTrackPoint = { tau: number; lat: number; lon: number };
export type ModelTrack = { model: string; points: ModelTrackPoint[] };

export type GeoJSONPolygon = GeoJsonPolygon;

export type WindRadii = {
  lat: number;
  lon: number;
  vmaxKt: number;
  validTime: string;
  /** Nautical miles per quadrant [NE, SE, SW, NW], or null at that threshold. */
  kt34: number[] | null;
  kt50: number[] | null;
  kt64: number[] | null;
};

// Synthetic per-forecast-point shape — produced by
// data/synthesizeForecastPoints.ts and rendered as its own DataPoint
// variant ("cyclones-forecast"). NOT persisted to IndexedDB; recomputed
// each time the cyclone provider data changes. The parent* fields let
// the mini-dossier identify the storm without re-walking allData.
export type CycloneForecastPointData = {
  parentStormId: string;
  parentName: string;
  parentBasin: "AL" | "EP" | "CP";
  fcstHour: number;
  validTime: string;
  maxWindKt: number;
  minPressureMb?: number;
  category: Category;
  /** Saffir-Simpson copied from parent storm — out-of-scope to derive
   *  per-fcstHour from maxWindKt at this stage. Future ticket. */
  saffirSimpson: 0 | 1 | 2 | 3 | 4 | 5;
  errorRadiusNm: number;
};

export type CycloneFilter = {
  enabled: boolean;
  /** Minimum Saffir-Simpson to display. 0 = all (incl TD/TS), 1 = HU1+, 3 = HU3+ (major), 5 = HU5 only */
  minCategory: 0 | 1 | 3 | 5;
  /** Show forecast track polyline + dots */
  showForecast: boolean;
  /** Show synthesized uncertainty cone */
  showCone: boolean;
  /** Show real 34/50/64-kt wind radii (ATCF b-deck). Off by default. */
  showWindField: boolean;
  /** Show per-model spaghetti tracks (ATCF a-deck). Off by default. */
  showModels: boolean;
  /** Model codes the user has toggled off in the legend (hidden everywhere). */
  hiddenModels?: readonly string[];
  /** Show NWS tropical watch/warning area polygons */
  showWarnings: boolean;
};
