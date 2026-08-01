// ── Cyclone correlation rules ───────────────────────────────────────

import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { Domain } from "@shared/domain/identity";
import { DEGREES_TO_RADIANS, haversineKm, TurnDeg } from "@shared/geo";
import { EMPTY_TEXT } from "@shared/text";
import type { DataPoint } from "@/features/base/dataPoints";
import { IntelProductType } from "@shared/domain/correlation";
import { CycloneWindThreshold } from "@/features/environmental/cyclones/classification";
import type { CycloneData } from "@/features/environmental/cyclones/types";
import type { IntelProduct } from "./types";

enum CycloneRulePolicy {
  HurricaneHunterRadiusKm = 300,
  ShelteringRadiusKm = 200,
  ShelteringMinShips = 5,
  PathRadiusKm = 250,
  PathMaxFcstHour = 72,
}

enum CycloneRulePriority {
  HurricaneHunter = 8,
  PathEvents = 7,
  Sheltering = 6,
}

enum HurricaneHunterTail {
  // NOAA Aircraft Operations Center: P-3s and the G-IV
  Noaa42 = "NOAA42",
  Noaa43 = "NOAA43",
  Noaa49 = "NOAA49",
  Noaa56 = "NOAA56",
  // 53rd WRS WC-130J Hurricane Hunters
  Teal71 = "TEAL71",
  Teal72 = "TEAL72",
  Teal73 = "TEAL73",
  Teal74 = "TEAL74",
  Teal75 = "TEAL75",
  Teal76 = "TEAL76",
}

const HURRICANE_HUNTER_TAILS: ReadonlySet<string> = new Set(
  Object.values(HurricaneHunterTail),
);

type CycloneItem = DataPoint & { type: Domain.Cyclones; data: CycloneData };

function activeCyclones(points: DataPoint[]): CycloneItem[] {
  return points.filter(
    (point): point is CycloneItem =>
      point.type === Domain.Cyclones &&
      point.data.maxWindKt >= CycloneWindThreshold.TropicalStorm,
  );
}

/** Bearing from origin to observer, 0-360 degrees clockwise from north. */
function quadrantOf(
  observerLat: number,
  observerLon: number,
  originLat: number,
  originLon: number,
): number {
  const dLon = (observerLon - originLon) * DEGREES_TO_RADIANS;
  const lat1 = originLat * DEGREES_TO_RADIANS;
  const lat2 = observerLat * DEGREES_TO_RADIANS;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (
    (Math.atan2(y, x) / DEGREES_TO_RADIANS + TurnDeg.Full) % TurnDeg.Full
  );
}

function isLeeQuadrant(shipBearing: number, motionDir: number): boolean {
  const opposite = (motionDir + TurnDeg.Half) % TurnDeg.Full;
  const diff = Math.min(
    Math.abs(shipBearing - opposite),
    TurnDeg.Full - Math.abs(shipBearing - opposite),
  );
  return diff <= TurnDeg.Quarter;
}

function detectHurricaneHunter(
  cyc: CycloneItem,
  points: DataPoint[],
): IntelProduct[] {
  const out: IntelProduct[] = [];
  for (const item of points) {
    if (item.type !== Domain.Aircraft) continue;
    const callsign = item.data.callsign?.trim().toUpperCase() ?? EMPTY_TEXT;
    const isHunter =
      item.data.military === true ||
      (callsign.length > 0 && HURRICANE_HUNTER_TAILS.has(callsign));
    if (!isHunter) continue;
    const dist = haversineKm(
      recordLatitude(item),
      recordLongitude(item),
      recordLatitude(cyc),
      recordLongitude(cyc),
    );
    if (dist > CycloneRulePolicy.HurricaneHunterRadiusKm) continue;
    out.push({
      id: `hh-${cyc.data.stormId}-${item.id}`,
      type: IntelProductType.CrossSource,
      priority: CycloneRulePriority.HurricaneHunter,
      title: `Hurricane Hunter, ${item.data.acType ?? "aircraft"} near ${cyc.data.name}`,
      summary: `${callsign || item.data.icao24} at ${dist.toFixed(0)} km from eye of ${cyc.data.name} (${cyc.data.classification}, ${cyc.data.maxWindKt} kn)`,
      region: cyc.data.basin,
      sources: [cyc, item],
      timestamp: Date.now(),
    });
  }
  return out;
}

function detectShipsSheltering(
  cyc: CycloneItem,
  points: DataPoint[],
): IntelProduct | null {
  if (cyc.data.movementDir == null) return null;
  const sheltering: DataPoint[] = [];
  for (const item of points) {
    if (item.type !== Domain.Ships) continue;
    const dist = haversineKm(
      recordLatitude(item),
      recordLongitude(item),
      recordLatitude(cyc),
      recordLongitude(cyc),
    );
    if (dist > CycloneRulePolicy.ShelteringRadiusKm) continue;
    const bearing = quadrantOf(
      recordLatitude(item),
      recordLongitude(item),
      recordLatitude(cyc),
      recordLongitude(cyc),
    );
    if (isLeeQuadrant(bearing, cyc.data.movementDir)) sheltering.push(item);
  }
  if (sheltering.length < CycloneRulePolicy.ShelteringMinShips) return null;
  return {
    id: `shelter-${cyc.data.stormId}`,
    type: IntelProductType.Cluster,
    priority: CycloneRulePriority.Sheltering,
    title: `Ships sheltering, ${sheltering.length} vessels lee of ${cyc.data.name}`,
    summary: `${sheltering.length} vessels clustered in lee quadrant of ${cyc.data.name}`,
    region: cyc.data.basin,
    sources: [cyc, ...sheltering],
    timestamp: Date.now(),
  };
}

function detectPathEvents(
  cyc: CycloneItem,
  points: DataPoint[],
): IntelProduct | null {
  const pathEvents: DataPoint[] = [];
  for (const fp of cyc.data.forecast) {
    if (fp.fcstHour > CycloneRulePolicy.PathMaxFcstHour) continue;
    for (const item of points) {
      if (item.type !== Domain.Events) continue;
      const dist = haversineKm(
        recordLatitude(item),
        recordLongitude(item),
        recordLatitude(fp),
        recordLongitude(fp),
      );
      if (dist <= CycloneRulePolicy.PathRadiusKm) pathEvents.push(item);
    }
  }
  if (pathEvents.length === 0) return null;
  const unique = Array.from(
    new Map(pathEvents.map((event) => [event.id, event])).values(),
  );
  return {
    id: `path-${cyc.data.stormId}`,
    type: IntelProductType.CrossSource,
    priority: CycloneRulePriority.PathEvents,
    title: `Path activity, ${unique.length} events in ${cyc.data.name} forecast track`,
    summary: `${unique.length} GDELT events in projected ${cyc.data.name} track (<=${CycloneRulePolicy.PathMaxFcstHour}h)`,
    region: cyc.data.basin,
    sources: [cyc, ...unique],
    timestamp: Date.now(),
  };
}

export function detectCycloneRules(points: DataPoint[]): IntelProduct[] {
  const cyclones = activeCyclones(points);
  if (cyclones.length === 0) return [];

  const out: IntelProduct[] = [];
  for (const cyc of cyclones) {
    out.push(...detectHurricaneHunter(cyc, points));
    const shelter = detectShipsSheltering(cyc, points);
    if (shelter) out.push(shelter);
    const path = detectPathEvents(cyc, points);
    if (path) out.push(path);
  }
  return out;
}
