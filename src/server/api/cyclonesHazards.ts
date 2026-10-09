import {
  Category,
  CYCLONE_CATEGORY_METADATA,
  CYCLONE_STRONG_WIND_RADIUS_KT,
  CYCLONE_THREAT_LEVELS,
  CycloneArrivalKind,
  CycloneThreatKind,
  CycloneThreatLevel,
  type CycloneArrivalLine,
  type CycloneArrivals,
  type CycloneHazards,
  type CycloneSurgeArea,
  type CycloneThreat,
  type CycloneWindChances,
} from "@shared/domain/cyclones";
import { isEnumValue } from "@shared/types/enum";
import { decodeHtmlEntities } from "../lib/htmlEntities";
import { fetchWithTimeout, FETCH_TIMEOUT_STANDARD_MS } from "../lib/fetchWithTimeout";
import { createPerKeyCache, PURGE_INTERVAL_MS } from "../lib/perKeyCache";
import {
  KmlElement,
  kmlDescription,
  kmlElementText,
  kmlLineStrings,
  kmlOuterRings,
  kmlPlacemarks,
  kmlStyleId,
} from "../lib/kml";
import { fetchKmz } from "./zipReader";
import { getCycloneCone } from "./cyclonesConeCache";
import { GeoLimit, type GeoPoint } from "@shared/geo";

const NHC_BASE = "https://www.nhc.noaa.gov";
const HTI_BASE = "https://tgftp.nws.noaa.gov/data/hurricane_products/hti";
const HAZARD_CACHE_TTL_MS = 60 * 60_000;
const AREA_MARGIN_DEGREES = 3;
const COORDINATE_DECIMALS = 2;

const WIND_CHANCE_THRESHOLDS_KT: readonly number[] = [
  CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt,
  CYCLONE_STRONG_WIND_RADIUS_KT,
  CYCLONE_CATEGORY_METADATA[Category.Hurricane1].minimumWindKt,
];

enum HazardText {
  ThreatPrefix = "Threat Level - ",
  ImpactsHeading = "Potential Impacts Include:",
  ImpactBullet = "*",
  SurgeAreaSeparator = "...",
  SurgeRangeKey = "peak_surge_range",
  ArrivalLineStyle = "toa_line",
  ProbabilityContourLabel = "Wind Speed Probability",
}

const TAG_PATTERN = /<[^<>]*>/g;
const TABLE_CELL_PATTERN = /<td>([^<]*)<\/td>/i;
const SURGE_RANGE_SEPARATOR = "-";

type Area = Readonly<{ minLon: number; maxLon: number; minLat: number; maxLat: number }>;

function stormArea(ring: readonly GeoPoint[] | undefined): Area | null {
  if (!ring || ring.length === 0) return null;
  const lons = ring.map(([lon]) => lon);
  const lats = ring.map(([, lat]) => lat);
  return {
    minLon: Math.min(...lons) - AREA_MARGIN_DEGREES,
    maxLon: Math.max(...lons) + AREA_MARGIN_DEGREES,
    minLat: Math.min(...lats) - AREA_MARGIN_DEGREES,
    maxLat: Math.max(...lats) + AREA_MARGIN_DEGREES,
  };
}

function touches(ring: readonly GeoPoint[], area: Area): boolean {
  return ring.some(([lon, lat]) =>
    lon >= area.minLon && lon <= area.maxLon && lat >= area.minLat && lat <= area.maxLat);
}

function compactRing(ring: readonly GeoPoint[]): GeoPoint[] {
  const scale = 10 ** COORDINATE_DECIMALS;
  const rounded = ring.map(([lon, lat]): GeoPoint => [Math.round(lon * scale) / scale, Math.round(lat * scale) / scale]);
  return rounded.filter(([lon, lat], index) => index === 0 || lon !== rounded[index - 1]?.[0] || lat !== rounded[index - 1]?.[1]);
}

async function fetchText(url: string): Promise<string | null> {
  const response = await fetchWithTimeout(url, FETCH_TIMEOUT_STANDARD_MS);
  return response.ok ? response.text() : null;
}

function impactsOf(description: string): string[] {
  return decodeHtmlEntities(description.replace(TAG_PATTERN, ""))
    .replace(HazardText.ImpactsHeading, "")
    .split(HazardText.ImpactBullet)
    .map((impact) => impact.trim())
    .filter((impact) => impact.length > 0);
}

/** The worst threat level whose area reaches the storm. */
export function parseThreatKml(kml: string, kind: CycloneThreatKind, area: Area): CycloneThreat | null {
  let worst: CycloneThreat | null = null;
  for (const placemark of kmlPlacemarks(kml)) {
    const level = kmlStyleId(placemark);
    if (!isEnumValue(level, CycloneThreatLevel) || level === CycloneThreatLevel.None) continue;
    if (!kmlOuterRings(placemark).some((ring) => touches(ring, area))) continue;
    if (worst && CYCLONE_THREAT_LEVELS.indexOf(level) <= CYCLONE_THREAT_LEVELS.indexOf(worst.level)) continue;
    const name = kmlElementText(placemark, KmlElement.Name) ?? "";
    worst = { kind, level, title: name.replace(HazardText.ThreatPrefix, ""), impacts: impactsOf(kmlDescription(placemark)) };
  }
  return worst;
}

function surgeRange(description: string): string | null {
  try {
    const parsed: unknown = JSON.parse(description);
    const range = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, HazardText.SurgeRangeKey) : null;
    return typeof range === "string" ? range : null;
  } catch {
    return null;
  }
}

function surgeUpperFeet(range: string): number {
  return Number.parseFloat(range.split(SURGE_RANGE_SEPARATOR).at(-1) ?? "") || 0;
}

/** Coastal peak surge ranges, highest first, one row per area. */
export function parsePeakSurgeKml(kml: string): CycloneSurgeArea[] {
  const areas = new Map<string, { range: string; rings: GeoPoint[][] }>();
  for (const placemark of kmlPlacemarks(kml)) {
    const range = surgeRange(kmlDescription(placemark));
    const name = kmlElementText(placemark, KmlElement.Name);
    if (!range || !name) continue;
    const area = decodeHtmlEntities(name.split(HazardText.SurgeAreaSeparator)[0] ?? name).trim();
    const rings = kmlOuterRings(placemark).map(compactRing).filter((ring) => ring.length >= GeoLimit.MinRingPointCount);
    const entry = areas.get(area) ?? { range, rings: [] };
    entry.rings.push(...rings);
    areas.set(area, entry);
  }
  return [...areas.entries()]
    .map(([area, entry]) => ({ area, range: entry.range, rings: entry.rings }))
    .sort((left, right) => surgeUpperFeet(right.range) - surgeUpperFeet(left.range));
}

/** Probability bands whose rings reach the storm. */
export function parseWindChanceKml(kml: string, thresholdKt: number, area: Area): CycloneWindChances {
  const bands = kmlPlacemarks(kml).flatMap((placemark) => {
    const band = decodeHtmlEntities(kmlElementText(placemark, KmlElement.Name) ?? "");
    const rings = kmlOuterRings(placemark)
      .filter((ring) => touches(ring, area))
      .map(compactRing)
      .filter((ring) => ring.length >= GeoLimit.MinRingPointCount);
    return band && rings.length > 0 ? [{ band, rings }] : [];
  });
  return { thresholdKt, bands };
}

/** Arrival-time isochrones, each labelled with its local time; the 5% probability boundary NHC draws with them is not an arrival time. */
export function parseArrivalKml(kml: string): CycloneArrivalLine[] {
  return kmlPlacemarks(kml).flatMap((placemark) => {
    if (kmlStyleId(placemark) !== HazardText.ArrivalLineStyle) return [];
    const label = TABLE_CELL_PATTERN.exec(kmlDescription(placemark))?.[1]?.trim();
    const line = kmlLineStrings(placemark)[0];
    if (!label || !line || label.startsWith(HazardText.ProbabilityContourLabel)) return [];
    return [{ label, line }];
  });
}

const nationalKmlCache = createPerKeyCache<string | null>({
  ttlMs: HAZARD_CACHE_TTL_MS,
  purgeIntervalMs: PURGE_INTERVAL_MS,
  emptyValue: null,
  fetch: (url) => (url.endsWith(".kmz") ? fetchKmz(url) : fetchText(url)),
  isEmpty: (value) => value === null,
});

async function nationalKml(url: string): Promise<string | null> {
  return (await nationalKmlCache.get(url)).value;
}

async function fetchThreats(area: Area): Promise<CycloneThreat[]> {
  const threats = await Promise.all(Object.values(CycloneThreatKind).map(async (kind) => {
    const kml = await nationalKml(`${HTI_BASE}/${kind}Threat.kml`);
    return kml ? parseThreatKml(kml, kind, area) : null;
  }));
  return threats.filter((threat): threat is CycloneThreat => threat !== null);
}

async function fetchWindChances(area: Area): Promise<CycloneWindChances[]> {
  const chances = await Promise.all(WIND_CHANCE_THRESHOLDS_KT.map(async (thresholdKt) => {
    const kml = await nationalKml(`${NHC_BASE}/gis/forecast/archive/latest_wsp${thresholdKt}knt120hr_5km.kmz`);
    return kml ? parseWindChanceKml(kml, thresholdKt, area) : null;
  }));
  return chances.filter((chance): chance is CycloneWindChances => chance !== null && chance.bands.length > 0);
}

async function fetchArrival(stormId: string): Promise<CycloneArrivals> {
  const arrival: { -readonly [Kind in keyof CycloneArrivals]: CycloneArrivals[Kind] } = {};
  await Promise.all(Object.values(CycloneArrivalKind).map(async (kind) => {
    const kml = await fetchKmz(`${NHC_BASE}/storm_graphics/api/${stormId}_${kind}_toa_34_latest.kmz`).catch(() => null);
    const lines = kml ? parseArrivalKml(kml) : [];
    if (lines.length > 0) arrival[kind] = lines;
  }));
  return arrival;
}

async function fetchPeakSurge(stormId: string): Promise<CycloneSurgeArea[]> {
  const kml = await fetchText(`${NHC_BASE}/gis/kml/surge/${stormId}_PeakStormSurge_latest.kml`).catch(() => null);
  return kml ? parsePeakSurgeKml(kml) : [];
}

/** NHC and NWS hazard products for one storm; parts NHC has not issued come back empty. */
export async function fetchCycloneHazards(stormId: string): Promise<CycloneHazards> {
  const { cone } = await getCycloneCone(stormId);
  const area = stormArea(cone?.coordinates[0]);
  const [threats, windChances, arrival, peakSurge] = await Promise.all([
    area ? fetchThreats(area) : [],
    area ? fetchWindChances(area) : [],
    fetchArrival(stormId),
    fetchPeakSurge(stormId),
  ]);
  return { threats, peakSurge, windChances, arrival };
}

export function __resetCycloneHazardsCacheForTests(): void {
  nationalKmlCache.reset();
}
