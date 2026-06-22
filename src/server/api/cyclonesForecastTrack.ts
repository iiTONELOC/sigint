// Real NHC CurrentStorms.json carries no inline forecast — the per-hour
// positions live only inside the storm's forecastTrack.kmzFile (TRACK.kmz).
// This fetches+parses that KMZ and the cone, and enriches each storm record
// before the cache write, so the client reads data.forecast / officialCone
// as plain fields with no per-storm fan-out.
//
// SSRF: kmzFile URLs come from NHC's payload, never from a client request.

import { getStormProducts } from "./cyclonesCache";
import { getCycloneCone } from "./cyclonesConeCache";
import { getCycloneAtcf, getCycloneModels } from "./cyclonesAtcfCache";
import { unzipSingleEntryKmz } from "./zipReader";
import { fetchWithTimeout, FETCH_TIMEOUT_STANDARD_MS } from "../lib/fetchWithTimeout";
import { createLogger } from "../lib/logger";
import { isFiniteCoordinate } from "../lib/geoValidation";

const logger = createLogger({ service: "nhc" });

// Field names match what client parseNhc.toForecastPoint maps from.
export type TrackForecastPoint = {
  fcstHour: number;
  validTime: string;
  latitude: number;
  longitude: number;
  maxWind: number;
};

function descriptionOf(placemark: string): string {
  const m = /<description>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/description>/i.exec(
    placemark,
  );
  return m?.[1] ?? "";
}

/** Pull the first lon,lat pair out of a `<Point><coordinates>` block. */
function pointCoords(placemark: string): { lon: number; lat: number } | null {
  const m = /<Point>[\s\S]*?<coordinates>\s*([^<]*?)\s*<\/coordinates>/i.exec(
    placemark,
  );
  if (!m?.[1]) return null;
  const first = m[1].trim().split(/\s+/)[0];
  if (!first) return null;
  const parts = first.split(",");
  const lon = Number.parseFloat(parts[0] ?? "");
  const lat = Number.parseFloat(parts[1] ?? "");
  if (!isFiniteCoordinate(lat, lon)) return null;
  return { lon, lat };
}

function forecastHourOf(desc: string): number | null {
  if (desc.search(/Forecast/i) < 0) return null;
  const m = /(\d+)\s*hr\s+Forecast/i.exec(desc);
  if (m?.[1]) return Number.parseInt(m[1], 10);
  return 0; // initial-position placemark says just "Forecast"
}

function maxWindKnotsOf(desc: string): number {
  const m = /Maximum Wind:\s*(\d+)\s*knots/i.exec(desc);
  return m?.[1] ? Number.parseInt(m[1], 10) : 0;
}

// NHC publishes only a localized string here, no machine timestamp — passed
// through verbatim and never parsed into a Date downstream.
function validTimeOf(desc: string): string {
  const m = /Valid at:\s*([^<]*?)\s*<\/td>/i.exec(desc);
  if (m?.[1]) return m[1].trim();
  const m2 = /Valid at:\s*([^\n<]+)/i.exec(desc);
  return m2?.[1] ? m2[1].trim() : "";
}

export function parseTrackKml(kml: string): TrackForecastPoint[] {
  const chunks = kml.split(/<Placemark\b/i).slice(1);
  const points: TrackForecastPoint[] = [];
  for (const chunk of chunks) {
    if (chunk.search(/<Point>/i) < 0) continue; // skip LineStrings
    const desc = descriptionOf(chunk);
    const fcstHour = forecastHourOf(desc);
    if (fcstHour == null) continue;
    const coords = pointCoords(chunk);
    if (!coords) continue;
    points.push({
      fcstHour,
      validTime: validTimeOf(desc),
      latitude: coords.lat,
      longitude: coords.lon,
      maxWind: maxWindKnotsOf(desc),
    });
  }
  points.sort((a, b) => a.fcstHour - b.fcstHour);
  return points;
}

// Returns [] on any failure — a track outage must not block the storm render.
async function fetchForecastTrack(stormId: string): Promise<TrackForecastPoint[]> {
  const products = getStormProducts(stormId);
  const url = products?.trackKmzUrl;
  if (!url) return [];
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_STANDARD_MS);
    if (!res.ok) return [];
    const buf = await res.arrayBuffer();
    const kml = await unzipSingleEntryKmz(new Uint8Array(buf));
    return parseTrackKml(kml);
  } catch {
    return [];
  }
}

// Attaches forecast + officialCone onto each storm in place, before the cache
// write. Per-storm failures are non-fatal — the storm renders with what succeeded.
export async function enrichStorms(activeStorms: unknown[]): Promise<void> {
  await Promise.all(
    activeStorms.map(async (s) => {
      if (!s || typeof s !== "object") return;
      const obj = s as Record<string, unknown>;
      const rawId = obj.id;
      if (typeof rawId !== "string") return;
      const stormId = rawId.toUpperCase();
      const [forecast, coneResult, atcf, modelsResult] = await Promise.all([
        fetchForecastTrack(stormId),
        getCycloneCone(stormId).catch(() => ({ cone: null })),
        getCycloneAtcf(stormId).catch(() => ({ radii: null, track: [] })),
        getCycloneModels(stormId).catch(() => ({ models: [] })),
      ]);
      // Gap-fill, never destroy: a fixture (or NHC payload) that already inlines
      // a forecast keeps it when the product fetch returns nothing.
      if (forecast.length > 0) obj.forecast = forecast;
      else if (!Array.isArray(obj.forecast)) obj.forecast = [];
      if (coneResult.cone) obj.officialCone = coneResult.cone;
      if (atcf.radii) obj.windRadii = atcf.radii;
      if (atcf.track && atcf.track.length > 0) obj.pastTrack = atcf.track;
      if (modelsResult.models.length > 0) obj.models = modelsResult.models;
    }),
  );
  logger.info("🌀 NHC: forecast track + cone enrichment complete");
}
