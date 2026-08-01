import type {
  GeoJsonPolygon,
  GeoJsonPolygonGeometry,
  GeoPoint,
} from "@shared/geo";
import type { NhcBasin } from "@shared/cyclonesSeason";
import type { Domain } from "@shared/domain/identity";
import {
  SaffirSimpson,
  type HurricaneScale,
  type MinCategory,
} from "@shared/domain/cycloneClassification";
import { AreaKind } from "@/workers/render/protocol";

export {
  MIN_CATEGORY_CHOICES,
  SaffirSimpson,
  type HurricaneScale,
  type MinCategory,
} from "@shared/domain/cycloneClassification";

export enum Category {
  TropicalDepression = "TD",
  TropicalStorm = "TS",
  Hurricane1 = "HU1",
  Hurricane2 = "HU2",
  Hurricane3 = "HU3",
  Hurricane4 = "HU4",
  Hurricane5 = "HU5",
  SubtropicalDepression = "STD",
  SubtropicalStorm = "STS",
  PostTropical = "PT",
}

export const HURRICANE_CATEGORY: Readonly<Record<HurricaneScale, Category>> = {
  [SaffirSimpson.Cat1]: Category.Hurricane1,
  [SaffirSimpson.Cat2]: Category.Hurricane2,
  [SaffirSimpson.Cat3]: Category.Hurricane3,
  [SaffirSimpson.Cat4]: Category.Hurricane4,
  [SaffirSimpson.Cat5]: Category.Hurricane5,
};

const HURRICANE_CATEGORIES: ReadonlySet<Category> = new Set(
  Object.values(HURRICANE_CATEGORY),
);

export function isHurricaneCategory(category: Category): boolean {
  return HURRICANE_CATEGORIES.has(category);
}

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
  /** Uppercase NHC storm ID, such as "AL052026". */
  stormId: string;
  /** Storm name, such as "ELENA". */
  name: string;
  /** Basin: AL=Atlantic, EP=East Pacific, CP=Central Pacific */
  basin: NhcBasin;
  /** Current classification at advisory time */
  classification: Category;
  /** Saffir-Simpson 1-5 (HU only), 0 for non-HU */
  saffirSimpson: SaffirSimpson;
  /** Max sustained winds at current position, in knots */
  maxWindKt: number;
  /** Min central pressure, in mb */
  minPressureMb?: number;
  /** Movement direction in degrees (0=N, 90=E) */
  movementDir?: number;
  /** Movement speed in knots */
  movementSpeedKt?: number;
  /** Latest advisory number, such as "12A". */
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

// A forecast scene hit resolves to this bounded UI projection in DataWorker.
// It is not persisted or sent to RenderWorker.
export type CycloneForecastPointData = {
  parentEntityId: string;
  parentName: string;
  parentBasin: NhcBasin;
  fcstHour: number;
  validTime: string;
  maxWindKt: number;
  minPressureMb?: number;
  category: Category;
  /** Saffir-Simpson copied from parent storm. Deriving it per fcstHour from
   *  maxWindKt is out of scope at this stage. */
  saffirSimpson: SaffirSimpson;
  errorRadiusNm: number;
};

export type CycloneFilter = {
  enabled: boolean;
  minCategory: MinCategory;
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

export enum CycloneFeatureLabel {
  Forecast = "CYCLONE FORECAST",
  TropicalAlert = "TROPICAL ALERT",
}

export enum CycloneKicker {
  MajorHurricane = "HURRICANE · MAJOR",
  Hurricane = "HURRICANE",
}

export enum CycloneRowLabel {
  Name = "Name",
  Storm = "Storm",
  StormId = "Storm ID",
  Basin = "Basin",
  Forecast = "Forecast",
  Winds = "Winds",
  Pressure = "Pressure",
  Movement = "Movement",
  Class = "Class",
  Classification = "Classification",
  Category = "Category",
  Advisory = "Advisory",
  Issued = "Issued",
  TrackError = "Track error",
}

export enum CycloneWarningField {
  Alert = "event",
  Area = "areaDesc",
  Headline = "headline",
  Effective = "effective",
  Expires = "expires",
}

export const CYCLONE_WARNING_FIELDS: readonly CycloneWarningField[] =
  Object.values(CycloneWarningField);

export type CycloneWarningData = Record<CycloneWarningField, string> &
  Readonly<{
    kind: AreaKind;
    geometry: GeoJsonPolygonGeometry;
  }>;

export type CycloneWarningPoint = {
  id: string;
  type: Domain.CyclonesWarning;
  position: GeoPoint;
  timestamp?: string;
  data: CycloneWarningData;
};
