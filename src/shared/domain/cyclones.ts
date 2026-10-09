import { isNhcBasin, type CycloneBasin } from "../cyclonesSeason";
import {
  interpolateGeoPoint,
  type GeoJsonPolygon,
  type GeoJsonPolygonGeometry,
  type GeoPoint,
} from "../geo";
import { MS_PER_HOUR, MS_PER_MINUTE } from "../time";
import type { Domain } from "./identity";
import { CacheKey } from "./cache";
import { BLANK_SEPARATOR } from "../text";
import type { WeatherData } from "./weather";

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

enum TropicalHazard {
  Hurricane = "hurricane",
  TropicalStorm = "tropical storm",
  StormSurge = "storm surge",
}

const TROPICAL_EVENTS: ReadonlySet<string> = new Set(
  Object.values(TropicalHazard).flatMap((hazard) =>
    AREA_KIND_ORDER.map((kind) => `${hazard}${BLANK_SEPARATOR}${kind}`),
  ),
);

export function isTropicalAlertEvent(event: string): boolean {
  return TROPICAL_EVENTS.has(event.toLowerCase());
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

const ATCF_TIME_LENGTH = 10;

export function atcfTimeMs(time: string): number {
  if (time.length !== ATCF_TIME_LENGTH || !/^\d+$/.test(time)) {
    return Number.NaN;
  }
  const year = Number(time.slice(0, 4));
  const month = Number(time.slice(4, 6));
  const day = Number(time.slice(6, 8));
  const hour = Number(time.slice(8, 10));
  return Date.UTC(year, month - 1, day, hour);
}

enum NhcTimeZone {
  Atlantic = "AST",
  EasternDaylight = "EDT",
  EasternStandard = "EST",
  CentralDaylight = "CDT",
  CentralStandard = "CST",
  MountainDaylight = "MDT",
  MountainStandard = "MST",
  PacificDaylight = "PDT",
  PacificStandard = "PST",
  Hawaii = "HST",
  Universal = "UTC",
}

const NHC_TIME_ZONE_UTC_OFFSET_HOURS: Readonly<Record<NhcTimeZone, number>> = {
  [NhcTimeZone.Atlantic]: -4,
  [NhcTimeZone.EasternDaylight]: -4,
  [NhcTimeZone.EasternStandard]: -5,
  [NhcTimeZone.CentralDaylight]: -5,
  [NhcTimeZone.CentralStandard]: -6,
  [NhcTimeZone.MountainDaylight]: -6,
  [NhcTimeZone.MountainStandard]: -7,
  [NhcTimeZone.PacificDaylight]: -7,
  [NhcTimeZone.PacificStandard]: -8,
  [NhcTimeZone.Hawaii]: -10,
  [NhcTimeZone.Universal]: 0,
};

const NHC_LOCAL_TIME = /^(\d{1,2}):(\d{2}) (AM|PM) ([A-Z]{3}) ([A-Za-z]+ \d{1,2},? \d{4})$/;
const NHC_AFTERNOON = "PM";
const HOURS_PER_HALF_DAY = 12;
const UTC_MIDNIGHT_SUFFIX = " 00:00 UTC";

function isNhcTimeZone(value: string): value is NhcTimeZone {
  return Object.values<string>(NhcTimeZone).includes(value);
}

function nhcLocalTimeMs(time: string): number {
  const match = NHC_LOCAL_TIME.exec(time);
  if (!match) return Number.NaN;
  const [, hour = "", minute = "", meridiem, zone = "", date = ""] = match;
  if (!isNhcTimeZone(zone)) return Number.NaN;
  const hours = (Number(hour) % HOURS_PER_HALF_DAY) + (meridiem === NHC_AFTERNOON ? HOURS_PER_HALF_DAY : 0);
  const utcHours = hours - NHC_TIME_ZONE_UTC_OFFSET_HOURS[zone];
  return Date.parse(`${date}${UTC_MIDNIGHT_SUFFIX}`) + utcHours * MS_PER_HOUR + Number(minute) * MS_PER_MINUTE;
}

export function cycloneTimeMs(time: string): number {
  const atcf = atcfTimeMs(time);
  if (Number.isFinite(atcf)) return atcf;
  const local = nhcLocalTimeMs(time);
  return Number.isFinite(local) ? local : Date.parse(time);
}

export type CycloneFix = Readonly<{ position: GeoPoint; timeMs: number }>;

export function forecastFix(point: Readonly<{ lat: number; lon: number; validTime: string }>): CycloneFix {
  return { position: [point.lon, point.lat], timeMs: cycloneTimeMs(point.validTime) };
}

export function estimatedCyclonePosition(
  advisory: CycloneFix,
  ahead: readonly CycloneFix[],
  now: number,
): GeoPoint {
  const next = ahead
    .filter((fix) => fix.timeMs > advisory.timeMs)
    .sort((left, right) => left.timeMs - right.timeMs)[0];
  if (!next || !Number.isFinite(advisory.timeMs)) return advisory.position;
  const ratio = Math.min(1, Math.max(0, (now - advisory.timeMs) / (next.timeMs - advisory.timeMs)));
  return interpolateGeoPoint(advisory.position, next.position, ratio);
}

export function estimatedStormPosition(advisory: GeoPoint, storm: CycloneData, now: number): GeoPoint {
  return estimatedCyclonePosition(
    { position: advisory, timeMs: cycloneTimeMs(storm.lastUpdate) },
    storm.forecast.map(forecastFix),
    now,
  );
}

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
  hazards?: CycloneHazards;
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

export enum CycloneThreatKind {
  Wind = "Wind",
  StormSurge = "StormSurge",
  FloodingRain = "FloodingRain",
  Tornado = "Tornado",
}

export enum CycloneThreatLevel {
  None = "none",
  Elevated = "elevated",
  Moderate = "moderate",
  High = "high",
  Extreme = "extreme",
}

export const CYCLONE_THREAT_LEVELS: readonly CycloneThreatLevel[] = Object.values(CycloneThreatLevel);

export enum CycloneArrivalKind {
  Earliest = "earliest_reasonable",
  MostLikely = "most_likely",
}

export type CycloneThreat = Readonly<{
  kind: CycloneThreatKind;
  level: CycloneThreatLevel;
  title: string;
  impacts: readonly string[];
}>;

export type CycloneSurgeArea = Readonly<{
  area: string;
  range: string;
  rings: readonly (readonly GeoPoint[])[];
}>;

export type CycloneWindChanceBand = Readonly<{
  band: string;
  rings: readonly (readonly GeoPoint[])[];
}>;

export type CycloneWindChances = Readonly<{
  thresholdKt: number;
  bands: readonly CycloneWindChanceBand[];
}>;

export type CycloneArrivalLine = Readonly<{ label: string; line: readonly GeoPoint[] }>;

export type CycloneArrivals = Partial<Record<CycloneArrivalKind, readonly CycloneArrivalLine[]>>;

export type CycloneHazards = Readonly<{
  threats: readonly CycloneThreat[];
  peakSurge: readonly CycloneSurgeArea[];
  windChances: readonly CycloneWindChances[];
  arrival: CycloneArrivals;
}>;

export function mappedWindChances(hazards: CycloneHazards | undefined): CycloneWindChances | undefined {
  const thresholdKt = CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt;
  return hazards?.windChances.find((chances) => chances.thresholdKt === thresholdKt);
}

export function mappedArrivalLines(hazards: CycloneHazards | undefined): readonly CycloneArrivalLine[] {
  return hazards?.arrival[CycloneArrivalKind.Earliest] ?? [];
}

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

export type CycloneWarningData = WeatherData &
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
