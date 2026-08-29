import { fetchIfModified, type ValidatorStore } from "../lib/fetchIfModified";
import { createPerKeyCache, PURGE_INTERVAL_MS } from "../lib/perKeyCache";
import { getStormProducts } from "./cyclonesCache";
import { CompassPoint } from "@shared/domain/compass";
import {
  Category,
  CYCLONE_CATEGORY_METADATA,
  CYCLONE_STRONG_WIND_RADIUS_KT,
  CycloneModelCode,
  type CycloneCoordinates,
  type ModelTrack,
  type ModelTrackPoint,
  type PastTrackPoint,
  type WindRadii,
} from "@shared/domain/cyclones";
import { HttpContentCoding, HttpStatus } from "@shared/http";

const ATCF_BTK_BASE = "https://ftp.nhc.noaa.gov/atcf/btk";
const ATCF_CACHE_TTL_MS = 3 * 60 * 60_000;
const ATCF_RETENTION_MS = 12 * 60 * 60_000;
const ATCF_BEST_TECHNIQUE = "BEST";
const ATCF_FULL_CIRCLE_WIND_CODE = "AAA";
const DECIMAL_RADIX = 10;
const bdeckValidators: ValidatorStore = new Map();

enum AtcfColumn {
  AnalysisTime = 2,
  Technique = 4,
  Tau = 5,
  Latitude = 6,
  Longitude = 7,
  MaximumWind = 8,
  Pressure = 9,
  WindThreshold = 11,
  WindCode = 12,
  FirstWindRadius = 13,
  WindRadiusEnd = 17,
}

function parseAtcfInteger(value: string | undefined): number {
  return Number.parseInt(value ?? "", DECIMAL_RADIX);
}

function parseAtcfCoordinate(
  value: string,
  positive: CompassPoint,
  negative: CompassPoint,
): number | null {
  const hemisphere = value.at(-1);
  const tenthsText = value.slice(0, -1);
  if (hemisphere !== positive && hemisphere !== negative) return null;
  if (!/^\d+$/.test(tenthsText)) return null;
  const tenths = Number(tenthsText);
  return (tenths / DECIMAL_RADIX) * (hemisphere === negative ? -1 : 1);
}

function parseAtcfCoordinates(
  latitude: string,
  longitude: string,
): CycloneCoordinates | null {
  const lat = parseAtcfCoordinate(latitude, CompassPoint.North, CompassPoint.South);
  const lon = parseAtcfCoordinate(longitude, CompassPoint.East, CompassPoint.West);
  return lat === null || lon === null ? null : { lat, lon };
}

function bestDeckRows(text: string, minimumFields: number): string[][] {
  const rows: string[][] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const fields = line.split(",").map((field) => field.trim());
    if (fields.length >= minimumFields && fields[AtcfColumn.Technique] === ATCF_BEST_TECHNIQUE) {
      rows.push(fields);
    }
  }
  return rows;
}

function applyWindRadiiRow(result: WindRadii, fields: string[]): void {
  const threshold = parseAtcfInteger(fields[AtcfColumn.WindThreshold]);
  let quadrants = fields
    .slice(AtcfColumn.FirstWindRadius, AtcfColumn.WindRadiusEnd)
    .map((value) => parseAtcfInteger(value) || 0);
  if (fields[AtcfColumn.WindCode] === ATCF_FULL_CIRCLE_WIND_CODE) {
    quadrants = quadrants.map(() => quadrants[0] ?? 0);
  }
  if (!quadrants.some((value) => value > 0)) return;
  if (threshold === CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt) {
    result.kt34 = quadrants;
  } else if (threshold === CYCLONE_STRONG_WIND_RADIUS_KT) {
    result.kt50 = quadrants;
  } else if (threshold === CYCLONE_CATEGORY_METADATA[Category.Hurricane1].minimumWindKt) {
    result.kt64 = quadrants;
  }
}

/** Parse the latest BEST wind-radii rows. */
export function parseAtcfBdeckRadii(text: string): WindRadii | null {
  const rows = bestDeckRows(text, AtcfColumn.WindRadiusEnd);
  let latestTime = "";
  for (const fields of rows) {
    const analysisTime = fields[AtcfColumn.AnalysisTime];
    if (analysisTime && analysisTime > latestTime) latestTime = analysisTime;
  }
  if (!latestTime) return null;

  const latestRows = rows.filter((fields) => fields[AtcfColumn.AnalysisTime] === latestTime);
  const firstRow = latestRows[0];
  if (!firstRow) return null;
  const position = parseAtcfCoordinates(
    firstRow[AtcfColumn.Latitude] ?? "", firstRow[AtcfColumn.Longitude] ?? "",
  );
  const result: WindRadii = {
    lat: position?.lat ?? 0,
    lon: position?.lon ?? 0,
    vmaxKt: parseAtcfInteger(firstRow[AtcfColumn.MaximumWind]) || 0,
    validTime: latestTime,
    kt34: null,
    kt50: null,
    kt64: null,
  };
  for (const fields of latestRows) applyWindRadiiRow(result, fields);
  return result.kt34 || result.kt50 || result.kt64 ? result : null;
}

/** Parse one observed point per ATCF analysis time. */
export function parseAtcfTrack(text: string): PastTrackPoint[] {
  const pointsByAnalysisTime = new Map<string, PastTrackPoint>();
  for (const fields of bestDeckRows(text, AtcfColumn.MaximumWind + 1)) {
    const analysisTime = fields[AtcfColumn.AnalysisTime];
    if (!analysisTime || pointsByAnalysisTime.has(analysisTime)) continue;
    const position = parseAtcfCoordinates(
      fields[AtcfColumn.Latitude] ?? "", fields[AtcfColumn.Longitude] ?? "",
    );
    if (!position) continue;
    pointsByAnalysisTime.set(analysisTime, {
      ...position,
      validTime: analysisTime,
      vmaxKt: parseAtcfInteger(fields[AtcfColumn.MaximumWind]) || 0,
      minPressureMb: parseAtcfPressure(fields[AtcfColumn.Pressure]),
    });
  }
  return [...pointsByAnalysisTime.values()].sort(
    (left, right) => left.validTime < right.validTime ? -1 : 1,
  );
}

function parseAtcfPressure(value: string | undefined): number | null {
  const pressure = parseAtcfInteger(value);
  return Number.isFinite(pressure) && pressure > 0 ? pressure : null;
}

export type AtcfData = { radii: WindRadii | null; track: PastTrackPoint[] };

const EMPTY_ATCF: AtcfData = { radii: null, track: [] };

async function fetchAtcfForStorm(
  stormId: string,
  previous: AtcfData | undefined,
): Promise<AtcfData> {
  const url = `${ATCF_BTK_BASE}/b${stormId.toLowerCase()}.dat`;
  try {
    const response = await fetchIfModified(url, stormId, bdeckValidators);
    if (response.status === HttpStatus.NotModified && previous) return previous;
    if (!response.ok) return previous ?? EMPTY_ATCF;
    const text = await response.text();
    return { radii: parseAtcfBdeckRadii(text), track: parseAtcfTrack(text) };
  } catch {
    return previous ?? EMPTY_ATCF;
  }
}

export type CycloneAtcfResult = AtcfData & { fetchedAt: number };

const atcfCache = createPerKeyCache<AtcfData>({
  ttlMs: ATCF_CACHE_TTL_MS,
  retentionMs: ATCF_RETENTION_MS,
  purgeIntervalMs: PURGE_INTERVAL_MS,
  emptyValue: EMPTY_ATCF,
  fetch: fetchAtcfForStorm,
});

export async function getCycloneAtcf(stormId: string): Promise<CycloneAtcfResult> {
  const { value, fetchedAt } = await atcfCache.get(stormId);
  return { radii: value.radii, track: value.track, fetchedAt };
}

const ATCF_ADECK_BASE = "https://ftp.nhc.noaa.gov/atcf/aid_public";
const SPAGHETTI_MODELS: ReadonlySet<string> = new Set(Object.values(CycloneModelCode));

const MIN_SPAGHETTI_MODELS = 3;
const ATCF_INITIALIZATION_LENGTH = 10;

interface GuidanceRow { initialization: string; model: string; fields: string[] }

function mapEntry<K, V>(map: Map<K, V>, key: K, createValue: () => V): V {
  const existing = map.get(key);
  if (existing) return existing;
  const created = createValue();
  map.set(key, created);
  return created;
}

function spaghettiRows(text: string): GuidanceRow[] {
  const rows: GuidanceRow[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const fields = line.split(",").map((field) => field.trim());
    const model = fields[AtcfColumn.Technique];
    const initialization = fields[AtcfColumn.AnalysisTime];
    if (fields.length > AtcfColumn.Longitude && model && initialization &&
      SPAGHETTI_MODELS.has(model)) {
      rows.push({ initialization, model, fields });
    }
  }
  return rows;
}

function initializationToMs(initialization: string): number {
  if (initialization.length !== ATCF_INITIALIZATION_LENGTH || !/^\d+$/.test(initialization)) {
    return Number.NaN;
  }
  const year = Number(initialization.slice(0, 4));
  const month = Number(initialization.slice(4, 6));
  const day = Number(initialization.slice(6, 8));
  const hour = Number(initialization.slice(8, 10));
  return Date.UTC(year, month - 1, day, hour);
}

function pickGuidanceInitialization(
  rows: readonly GuidanceRow[],
  analysisTime?: string,
): string | null {
  const modelsByInitialization = new Map<string, Set<string>>();
  for (const row of rows) {
    mapEntry(modelsByInitialization, row.initialization, () => new Set<string>()).add(row.model);
  }
  const candidates = [...modelsByInitialization.entries()]
    .filter(([, models]) => models.size >= MIN_SPAGHETTI_MODELS)
    .map(([initialization]) => initialization);
  if (candidates.length === 0) return null;

  const targetTime = analysisTime ? initializationToMs(analysisTime) : Number.NaN;
  return candidates.reduce(
    (selected, initialization) => {
      if (!Number.isFinite(targetTime)) {
        return initialization.localeCompare(selected) > 0 ? initialization : selected;
      }
      return Math.abs(initializationToMs(initialization) - targetTime) <
        Math.abs(initializationToMs(selected) - targetTime)
        ? initialization : selected;
    },
    candidates[0]!,
  );
}

export function parseAtcfAdeck(text: string, analysisTime?: string): ModelTrack[] {
  const rows = spaghettiRows(text);
  const selectedInitialization = pickGuidanceInitialization(rows, analysisTime);
  if (!selectedInitialization) return [];

  const pointsByModel = new Map<string, Map<number, ModelTrackPoint>>();
  for (const { initialization, model, fields } of rows) {
    if (initialization !== selectedInitialization) continue;
    const tau = parseAtcfInteger(fields[AtcfColumn.Tau]);
    const position = parseAtcfCoordinates(
      fields[AtcfColumn.Latitude] ?? "", fields[AtcfColumn.Longitude] ?? "",
    );
    if (!Number.isFinite(tau) || !position) continue;
    const pointsByTau = mapEntry(pointsByModel, model, () => new Map<number, ModelTrackPoint>());
    if (!pointsByTau.has(tau)) pointsByTau.set(tau, { tau, lat: position.lat, lon: position.lon });
  }

  const tracks: ModelTrack[] = [];
  for (const [model, pointsByTau] of pointsByModel) {
    const points = [...pointsByTau.values()].sort((left, right) => left.tau - right.tau);
    if (points.length >= 2) tracks.push({ model, points });
  }
  return tracks;
}

const adeckValidators: ValidatorStore = new Map();

async function fetchModelsForStorm(
  stormId: string,
  previous: ModelTrack[] | undefined,
): Promise<ModelTrack[]> {
  const products = getStormProducts(stormId);
  const url = products?.modelsUrl ?? `${ATCF_ADECK_BASE}/a${stormId.toLowerCase()}.dat.gz`;
  try {
    const response = await fetchIfModified(url, stormId, adeckValidators);
    if (response.status === HttpStatus.NotModified && previous) return previous;
    if (!response.ok || !response.body) return previous ?? [];
    const stream = response.body.pipeThrough(new DecompressionStream(HttpContentCoding.Gzip));
    const text = await new Response(stream).text();
    return parseAtcfAdeck(text, products?.analysisInit);
  } catch {
    return previous ?? [];
  }
}

const modelsCache = createPerKeyCache<ModelTrack[]>({
  ttlMs: ATCF_CACHE_TTL_MS,
  retentionMs: ATCF_RETENTION_MS,
  purgeIntervalMs: PURGE_INTERVAL_MS,
  emptyValue: [],
  fetch: fetchModelsForStorm,
});

export type CycloneModelsResult = { models: ModelTrack[]; fetchedAt: number };

/** Return model tracks for one storm. */
export async function getCycloneModels(stormId: string): Promise<CycloneModelsResult> {
  const { value, fetchedAt } = await modelsCache.get(stormId);
  return { models: value, fetchedAt };
}

export function __resetCycloneAtcfCacheForTests(): void {
  atcfCache.reset();
  modelsCache.reset();
  bdeckValidators.clear();
  adeckValidators.clear();
}
