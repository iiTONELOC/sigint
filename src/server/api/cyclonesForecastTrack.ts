import { getStormProducts } from "./cyclonesCache";
import { getCycloneCone } from "./cyclonesConeCache";
import { getCycloneAtcf, getCycloneModels } from "./cyclonesAtcfCache";
import { fetchKmz } from "./zipReader";
import { createLogger } from "../lib/logger";
import { isFiniteCoordinate } from "../lib/geoValidation";
import type { CycloneCoordinates, NhcForecastPoint } from "@shared/domain/cyclones";
import { BLANK_SEPARATOR } from "@shared/text";

const logger = createLogger({ service: "nhc" });

enum KmlElement {
  Coordinates = "coordinates",
  Description = "description",
  Point = "point",
}

enum ForecastLabel {
  Forecast = "forecast",
  Hour = "hr",
  Knots = "knots",
  MaximumWind = "maximum wind:",
  ValidAt = "valid at:",
}

enum CdataMarker {
  Open = "<![CDATA[",
  Close = "]]>",
}

function elementText(source: string, element: KmlElement, from = 0): string | null {
  const lowercaseSource = source.toLowerCase();
  const openTag = `<${element}>`;
  const closeTag = `</${element}>`;
  const openIndex = lowercaseSource.indexOf(openTag, from);
  if (openIndex < 0) return null;
  const start = openIndex + openTag.length;
  const end = lowercaseSource.indexOf(closeTag, start);
  return end < 0 ? null : source.slice(start, end).trim();
}

function descriptionOf(placemark: string): string {
  const description = elementText(placemark, KmlElement.Description);
  if (!description?.toUpperCase().startsWith(CdataMarker.Open)) return description ?? "";
  const content = description.slice(CdataMarker.Open.length);
  return content.endsWith(CdataMarker.Close)
    ? content.slice(0, -CdataMarker.Close.length).trim()
    : content;
}

function pointCoordinates(placemark: string): CycloneCoordinates | null {
  const pointIndex = placemark.toLowerCase().indexOf(`<${KmlElement.Point}>`);
  if (pointIndex < 0) return null;
  const coordinates = elementText(placemark, KmlElement.Coordinates, pointIndex);
  const firstCoordinate = coordinates?.split(/\s+/)[0];
  if (!firstCoordinate) return null;
  const coordinateParts = firstCoordinate.split(",");
  const lon = Number.parseFloat(coordinateParts[0] ?? "");
  const lat = Number.parseFloat(coordinateParts[1] ?? "");
  if (!isFiniteCoordinate(lat, lon)) return null;
  return { lon, lat };
}

function forecastHourOf(normalizedDescription: string): number | null {
  if (!normalizedDescription.includes(ForecastLabel.Forecast)) return null;
  const marker = `${ForecastLabel.Hour}${BLANK_SEPARATOR}${ForecastLabel.Forecast}`;
  let markerIndex = normalizedDescription.indexOf(marker);
  while (markerIndex >= 0) {
    let digitEnd = markerIndex;
    while (normalizedDescription[digitEnd - 1] === BLANK_SEPARATOR) digitEnd -= 1;
    let digitStart = digitEnd;
    while (digitStart > 0 && /\d/.test(normalizedDescription[digitStart - 1] ?? "")) digitStart -= 1;
    if (digitStart < digitEnd) return Number(normalizedDescription.slice(digitStart, digitEnd));
    markerIndex = normalizedDescription.indexOf(marker, markerIndex + marker.length);
  }
  return 0;
}

function maxWindKnotsOf(normalizedDescription: string): number {
  const labelIndex = normalizedDescription.indexOf(ForecastLabel.MaximumWind);
  if (labelIndex < 0) return 0;
  let cursor = labelIndex + ForecastLabel.MaximumWind.length;
  if (normalizedDescription[cursor] === BLANK_SEPARATOR) cursor += 1;
  const digitStart = cursor;
  while (/\d/.test(normalizedDescription[cursor] ?? "")) cursor += 1;
  if (cursor === digitStart) return 0;
  const windKnots = Number(normalizedDescription.slice(digitStart, cursor));
  if (normalizedDescription[cursor] === BLANK_SEPARATOR) cursor += 1;
  return normalizedDescription.startsWith(ForecastLabel.Knots, cursor) ? windKnots : 0;
}

function validTimeOf(description: string): string {
  const lower = description.toLowerCase();
  const labelIndex = lower.indexOf(ForecastLabel.ValidAt);
  if (labelIndex < 0) return "";
  const start = labelIndex + ForecastLabel.ValidAt.length;
  const lineEnd = description.indexOf("\n", start);
  const tagEnd = description.indexOf("<", start);
  const end = Math.min(description.length, ...[lineEnd, tagEnd].filter((index) => index >= 0));
  return description.slice(start, end).trim();
}

export function parseTrackKml(kml: string): NhcForecastPoint[] {
  const placemarks = kml.split(/<Placemark\b/i).slice(1);
  const points: NhcForecastPoint[] = [];
  for (const placemark of placemarks) {
    if (!placemark.toLowerCase().includes(`<${KmlElement.Point}>`)) continue;
    const description = descriptionOf(placemark);
    const normalizedDescription = description.toLowerCase().replace(/\s+/g, BLANK_SEPARATOR);
    const forecastHour = forecastHourOf(normalizedDescription);
    if (forecastHour === null) continue;
    const coordinates = pointCoordinates(placemark);
    if (!coordinates) continue;
    points.push({
      fcstHour: forecastHour,
      validTime: validTimeOf(description),
      latitude: coordinates.lat,
      longitude: coordinates.lon,
      maxWind: maxWindKnotsOf(normalizedDescription),
    });
  }
  points.sort((left, right) => left.fcstHour - right.fcstHour);
  return points;
}

async function fetchForecastTrack(stormId: string): Promise<NhcForecastPoint[]> {
  const products = getStormProducts(stormId);
  const url = products?.trackKmzUrl;
  if (!url) return [];
  try {
    const kml = await fetchKmz(url);
    return kml === null ? [] : parseTrackKml(kml);
  } catch {
    return [];
  }
}

/** Add available forecast products without removing inline source data. */
export async function enrichStorms(activeStorms: unknown[]): Promise<void> {
  await Promise.all(
    activeStorms.map(async (storm) => {
      if (!storm || typeof storm !== "object") return;
      const record = storm as Record<string, unknown>;
      const sourceId = record.id;
      if (typeof sourceId !== "string") return;
      const stormId = sourceId.toUpperCase();
      const [forecast, coneResult, atcf, modelsResult] = await Promise.all([
        fetchForecastTrack(stormId),
        getCycloneCone(stormId).catch(() => ({ cone: null })),
        getCycloneAtcf(stormId).catch(() => ({ radii: null, track: [] })),
        getCycloneModels(stormId).catch(() => ({ models: [] })),
      ]);
      if (forecast.length > 0) record.forecast = forecast;
      else if (!Array.isArray(record.forecast)) record.forecast = [];
      if (coneResult.cone) record.officialCone = coneResult.cone;
      if (atcf.radii) record.windRadii = atcf.radii;
      if (atcf.track.length > 0) record.pastTrack = atcf.track;
      if (modelsResult.models.length > 0) record.models = modelsResult.models;
    }),
  );
  logger.info("🌀 NHC: forecast track + cone enrichment complete");
}
