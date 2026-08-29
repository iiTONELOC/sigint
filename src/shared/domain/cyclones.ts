import { isNhcBasin, type CycloneBasin } from "../cyclonesSeason";
import type {
  GeoJsonPolygon,
  GeoJsonPolygonGeometry,
  GeoPoint,
} from "../geo";
import type { Domain } from "./identity";
import { CacheKey } from "./cache";

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

export enum CycloneModelCode {
  Official = "OFCL",
  Consensus = "TVCN",
  Gfs = "AVNO",
  GfsOperational = "GFSO",
  Ecmwf = "EMXI",
  EcmwfOperational = "EMX",
  Canadian = "CMC",
  CanadianInterpolated = "CMCI",
  Ukmet = "UKM",
  UkmetInterpolated = "UKMI",
  Hwrf = "HWRF",
  HwrfInterpolated = "HWFI",
  Hmon = "HMON",
  HmonInterpolated = "HMNI",
  Navy = "NVGM",
  GefsMean = "AEMN",
}

export enum SaffirSimpson {
  None = 0,
  Cat1 = 1,
  Cat2 = 2,
  Cat3 = 3,
  Cat4 = 4,
  Cat5 = 5,
}

export type CycloneCategoryMetadata = Readonly<{
  color: string;
  label: string;
  minimumWindKt: number;
  saffirSimpson: SaffirSimpson;
}>;

export const CYCLONE_CATEGORY_METADATA: Readonly<
  Record<Category, CycloneCategoryMetadata>
> = {
  [Category.TropicalDepression]: { color: "#8fd3ff", label: "Tropical Depression", minimumWindKt: 0, saffirSimpson: SaffirSimpson.None },
  [Category.TropicalStorm]: { color: "#4ad2ff", label: "Tropical Storm", minimumWindKt: 34, saffirSimpson: SaffirSimpson.None },
  [Category.Hurricane1]: { color: "#ffd24a", label: "Hurricane Cat 1", minimumWindKt: 64, saffirSimpson: SaffirSimpson.Cat1 },
  [Category.Hurricane2]: { color: "#ffb142", label: "Hurricane Cat 2", minimumWindKt: 83, saffirSimpson: SaffirSimpson.Cat2 },
  [Category.Hurricane3]: { color: "#ff8c42", label: "Hurricane Cat 3 (major)", minimumWindKt: 96, saffirSimpson: SaffirSimpson.Cat3 },
  [Category.Hurricane4]: { color: "#ff5d5d", label: "Hurricane Cat 4 (major)", minimumWindKt: 113, saffirSimpson: SaffirSimpson.Cat4 },
  [Category.Hurricane5]: { color: "#ff5dff", label: "Hurricane Cat 5 (major)", minimumWindKt: 137, saffirSimpson: SaffirSimpson.Cat5 },
  [Category.SubtropicalDepression]: { color: "#8fd3ff", label: "Subtropical Depression", minimumWindKt: 0, saffirSimpson: SaffirSimpson.None },
  [Category.SubtropicalStorm]: { color: "#4ad2ff", label: "Subtropical Storm", minimumWindKt: 34, saffirSimpson: SaffirSimpson.None },
  [Category.PostTropical]: { color: "#8fd3ff", label: "Post-Tropical", minimumWindKt: 0, saffirSimpson: SaffirSimpson.None },
};

export const CYCLONE_STRONG_WIND_RADIUS_KT = 50;

export function cycloneCategoryShortLabel(category: Category): string {
  const { saffirSimpson: scale } = CYCLONE_CATEGORY_METADATA[category];
  return scale === SaffirSimpson.None ? category : `C${scale}`;
}

export const CYCLONE_HURRICANE_CATEGORIES_DESCENDING: readonly Category[] =
  Object.values(Category)
    .filter(
      (category) =>
        CYCLONE_CATEGORY_METADATA[category].saffirSimpson !== SaffirSimpson.None,
    )
    .sort(
      (left, right) =>
        CYCLONE_CATEGORY_METADATA[right].minimumWindKt -
        CYCLONE_CATEGORY_METADATA[left].minimumWindKt,
    );

export function saffirSimpsonForWind(maxWindKt: number): SaffirSimpson {
  for (const category of CYCLONE_HURRICANE_CATEGORIES_DESCENDING) {
    if (maxWindKt >= CYCLONE_CATEGORY_METADATA[category].minimumWindKt) {
      return CYCLONE_CATEGORY_METADATA[category].saffirSimpson;
    }
  }
  return SaffirSimpson.None;
}

export enum AreaKind {
  Watch = "watch",
  Warning = "warning",
}

const AREA_KIND_ORDER: readonly AreaKind[] = Object.values(AreaKind);

export function areaKindRank(kind: AreaKind): number {
  return AREA_KIND_ORDER.indexOf(kind);
}

export function areaKindFromRank(rank: number): AreaKind {
  return AREA_KIND_ORDER[rank] ?? AreaKind.Watch;
}

export type HurricaneScale = Exclude<
  SaffirSimpson,
  SaffirSimpson.None
>;

export function cycloneCategoryForScale(scale: HurricaneScale): Category {
  return CYCLONE_HURRICANE_CATEGORIES_DESCENDING.at(-scale) ??
    Category.Hurricane1;
}

export type MinCategory =
  | SaffirSimpson.None
  | SaffirSimpson.Cat1
  | SaffirSimpson.Cat3
  | SaffirSimpson.Cat5;

export const MIN_CATEGORY_CHOICES: readonly MinCategory[] = [
  SaffirSimpson.None,
  SaffirSimpson.Cat1,
  SaffirSimpson.Cat3,
  SaffirSimpson.Cat5,
];

export type CycloneCoordinates = {
  lat: number;
  lon: number;
};

export type CycloneStormReference = Readonly<{
  stormId: string;
}>;

export type CycloneForecastFact = CycloneCoordinates & {
  fcstHour: number;
  maxWindKt: number;
  errorRadiusNm: number;
};

export type ForecastPoint = CycloneForecastFact & {
  validTime: string;
  minPressureMb?: number;
  category: Category;
};

export type NhcForecastPoint = {
  fcstHour: number;
  validTime: string;
  latitude: number;
  longitude: number;
  maxWind: number;
  minPressure?: number;
  development?: string;
};

export type PastTrackPoint = CycloneCoordinates & {
  validTime: string;
  vmaxKt: number;
  minPressureMb?: number | null;
};

export type ModelTrackPoint = CycloneCoordinates & {
  tau: number;
};

export type ModelTrack = {
  model: string;
  points: ModelTrackPoint[];
};

export type WindRadii = CycloneCoordinates & {
  vmaxKt: number;
  validTime: string;
  kt34: number[] | null;
  kt50: number[] | null;
  kt64: number[] | null;
};

export type CycloneData = CycloneStormReference & {
  name: string;
  basin: CycloneBasin;
  classification: Category;
  saffirSimpson: SaffirSimpson;
  maxWindKt: number;
  minPressureMb?: number;
  movementDir?: number;
  movementSpeedKt?: number;
  advisoryNumber: string;
  lastUpdate: string;
  forecast: ForecastPoint[];
  officialCone?: GeoJsonPolygon;
  windRadii?: WindRadii;
  pastTrack?: PastTrackPoint[];
  models?: ModelTrack[];
};

const CYCLONE_STORM_NUMBER = /^\d{6}$/;

export enum CycloneRoute {
  Dossier = "/api/dossier/cyclone",
  Latest = "/api/cyclones/latest",
}

export const CYCLONE_DOSSIER_CACHE_PREFIX = `${CacheKey.CycloneDossier}.`;

export enum CycloneDossierProductKind {
  Advisory = "advisory",
  Discussion = "discussion",
  WindProbabilities = "windProbs",
}

export type CycloneDossierProductBody = Readonly<{
  advisoryNumber: string;
  issuedAt: string;
  body: string;
  nextAdvisory: string;
}>;

export type CycloneDossierBundle = Readonly<
  CycloneStormReference &
    Partial<Record<CycloneDossierProductKind, CycloneDossierProductBody>>
>;

export type CycloneDossierResult = Readonly<{
  dossier: CycloneDossierBundle | null;
  fetchedAt: number;
}>;

export function parseCycloneStormId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase();
  const valid = isNhcBasin(normalized.slice(0, 2)) &&
    CYCLONE_STORM_NUMBER.test(normalized.slice(2));
  return valid ? normalized : null;
}

export type CycloneForecastPointData = {
  parentEntityId: string;
  parentName: string;
  parentBasin: CycloneBasin;
  fcstHour: number;
  validTime: string;
  maxWindKt: number;
  minPressureMb?: number;
  category: Category;
  saffirSimpson: SaffirSimpson;
  errorRadiusNm: number;
};

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
