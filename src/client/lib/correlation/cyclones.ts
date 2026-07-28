// ── Cyclone correlation rules ───────────────────────────────────────
// Three rules added by the cyclones feature:
//  1. Hurricane Hunter — military/NOAA42-49/56 + TEAL71-76 aircraft
//     within 300km of an active cyclone (≥34 kt)
//  2. Ships Sheltering — ≥5 ships clustered in the lee quadrant of a
//     moving cyclone within 200km
//  3. Cyclone-Path Events — GDELT events within 250km of any forecast
//     point at fcstHour ≤ 72; deduped by event id

import type { DataPoint } from "@/features/base/dataPoints";
import { IntelProductType } from "@shared/domain/correlation";
import type { CycloneData } from "@/features/environmental/cyclones/types";
import type { IntelProduct } from "./types";
import { haversineKm } from "./shared";

const HURRICANE_HUNTER_RADIUS_KM = 300;
const SHELTERING_RADIUS_KM = 200;
const SHELTERING_THRESHOLD = 5;
const CYCLONE_PATH_RADIUS_KM = 250;

const HURRICANE_HUNTER_TAILS = new Set([
  // NOAA Aircraft Operations Center — P-3s and G-IV
  "NOAA42",
  "NOAA43",
  "NOAA49",
  "NOAA56",
  // 53rd WRS WC-130J Hurricane Hunters
  "TEAL71",
  "TEAL72",
  "TEAL73",
  "TEAL74",
  "TEAL75",
  "TEAL76",
]);

type CycloneItem = DataPoint & { type: "cyclones"; data: CycloneData };

function activeCyclones(allData: DataPoint[]): CycloneItem[] {
  return allData.filter(
    (d): d is CycloneItem =>
      d.type === "cyclones" && d.data.maxWindKt >= 34,
  );
}

/** Bearing from origin to observer, 0–360 degrees clockwise from north. */
function quadrantOf(
  observerLat: number,
  observerLon: number,
  originLat: number,
  originLon: number,
): number {
  const dLon = ((observerLon - originLon) * Math.PI) / 180;
  const lat1 = (originLat * Math.PI) / 180;
  const lat2 = (observerLat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function isLeeQuadrant(shipBearing: number, motionDir: number): boolean {
  const opposite = (motionDir + 180) % 360;
  const diff = Math.min(
    Math.abs(shipBearing - opposite),
    360 - Math.abs(shipBearing - opposite),
  );
  return diff <= 90;
}

function detectHurricaneHunter(
  cyc: CycloneItem,
  allData: DataPoint[],
): IntelProduct[] {
  const out: IntelProduct[] = [];
  for (const item of allData) {
    if (item.type !== "aircraft") continue;
    const ac = item.data as Record<string, unknown>;
    const callsignRaw =
      typeof ac.callsign === "string" ? ac.callsign.trim().toUpperCase() : "";
    const isHunter =
      ac.military === true ||
      (callsignRaw.length > 0 && HURRICANE_HUNTER_TAILS.has(callsignRaw));
    if (!isHunter) continue;
    const dist = haversineKm(item.lat, item.lon, cyc.lat, cyc.lon);
    if (dist > HURRICANE_HUNTER_RADIUS_KM) continue;
    out.push({
      id: `hh-${cyc.data.stormId}-${item.id}`,
      type: IntelProductType.CrossSource,
      priority: 8,
      title: `Hurricane Hunter — ${(ac.acType as string) ?? "aircraft"} near ${cyc.data.name}`,
      summary: `${callsignRaw || (ac.icao24 as string)} at ${dist.toFixed(0)} km from eye of ${cyc.data.name} (${cyc.data.classification}, ${cyc.data.maxWindKt} kn)`,
      region: cyc.data.basin,
      sources: [cyc, item],
      timestamp: Date.now(),
    });
  }
  return out;
}

function detectShipsSheltering(
  cyc: CycloneItem,
  allData: DataPoint[],
): IntelProduct | null {
  if (cyc.data.movementDir == null) return null;
  const sheltering: DataPoint[] = [];
  for (const item of allData) {
    if (item.type !== "ships") continue;
    const dist = haversineKm(item.lat, item.lon, cyc.lat, cyc.lon);
    if (dist > SHELTERING_RADIUS_KM) continue;
    const bearing = quadrantOf(item.lat, item.lon, cyc.lat, cyc.lon);
    if (isLeeQuadrant(bearing, cyc.data.movementDir)) sheltering.push(item);
  }
  if (sheltering.length < SHELTERING_THRESHOLD) return null;
  return {
    id: `shelter-${cyc.data.stormId}`,
    type: IntelProductType.Cluster,
    priority: 6,
    title: `Ships sheltering — ${sheltering.length} vessels lee of ${cyc.data.name}`,
    summary: `${sheltering.length} vessels clustered in lee quadrant of ${cyc.data.name}`,
    region: cyc.data.basin,
    sources: [cyc, ...sheltering],
    timestamp: Date.now(),
  };
}

function detectPathEvents(
  cyc: CycloneItem,
  allData: DataPoint[],
): IntelProduct | null {
  const pathEvents: DataPoint[] = [];
  for (const fp of cyc.data.forecast) {
    if (fp.fcstHour > 72) continue;
    for (const item of allData) {
      if (item.type !== "events") continue;
      const dist = haversineKm(item.lat, item.lon, fp.lat, fp.lon);
      if (dist <= CYCLONE_PATH_RADIUS_KM) pathEvents.push(item);
    }
  }
  if (pathEvents.length === 0) return null;
  const unique = Array.from(
    new Map(pathEvents.map((e) => [e.id, e])).values(),
  );
  return {
    id: `path-${cyc.data.stormId}`,
    type: IntelProductType.CrossSource,
    priority: 7,
    title: `Path activity — ${unique.length} events in ${cyc.data.name} forecast track`,
    summary: `${unique.length} GDELT events in projected ${cyc.data.name} track (≤72h)`,
    region: cyc.data.basin,
    sources: [cyc, ...unique],
    timestamp: Date.now(),
  };
}

export function detectCycloneRules(allData: DataPoint[]): IntelProduct[] {
  const cyclones = activeCyclones(allData);
  if (cyclones.length === 0) return [];

  const out: IntelProduct[] = [];
  for (const cyc of cyclones) {
    out.push(...detectHurricaneHunter(cyc, allData));
    const shelter = detectShipsSheltering(cyc, allData);
    if (shelter) out.push(shelter);
    const path = detectPathEvents(cyc, allData);
    if (path) out.push(path);
  }
  return out;
}
