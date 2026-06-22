// ── useLandfallEta ───────────────────────────────────────────────────
// When (and whether) the storm's official forecast track first crosses a
// coastline. Pure real data: the NHC forecast positions tested against the
// shared coastline polygons — the ETA is the first forecast point that lands on
// land, reported verbatim (no interpolation, no invented time). Non-blocking:
// the land test runs in idle, narrowed by a per-ring bbox pre-check.

import { useEffect, useState } from "react";
import { getLand, enrichLand } from "@/lib/geo/landService";
import { ringContains, type Ring } from "@/lib/geo/pointInPolygon";
import { scheduleIdle } from "@/lib/runtime/idle";
import { formatTime } from "@/lib/format/timeFormat";
import type { ForecastPoint } from "../types";

export type Landfall =
  | { kind: "onshore" } // already over land
  | { kind: "eta"; fcstHour: number; validTime: string }
  | { kind: "none" }; // stays over water through the forecast

/** Human label for the landfall state. `urgent` is false only when the storm
 *  stays offshore through the forecast (so the UI can dim that case). */
export function landfallText(lf: Landfall): { text: string; urgent: boolean } {
  if (lf.kind === "onshore") return { text: "Onshore now", urgent: true };
  if (lf.kind === "none") return { text: "None in forecast", urgent: false };
  return { text: `≈ +${lf.fcstHour}h · ${formatTime(lf.validTime)}`, urgent: true };
}

type LandBox = {
  ring: Ring;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

// Per-ring bbox list, memoized against the land array reference so it's built
// once (land is global + stable after load).
let boxCache: { land: number[][][]; boxes: LandBox[] } | null = null;

function ringBox(ring: number[][]): LandBox | null {
  if (!ring || ring.length < 3) return null;
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  for (const [lon, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return { ring: ring as Ring, minLat, maxLat, minLon, maxLon };
}

function landBoxes(): LandBox[] {
  const land = getLand();
  if (boxCache && boxCache.land === land) return boxCache.boxes;
  const boxes: LandBox[] = [];
  for (const ring of land) {
    const box = ringBox(ring);
    if (box) boxes.push(box);
  }
  boxCache = { land, boxes };
  return boxes;
}

function onLand(lat: number, lon: number, boxes: LandBox[]): boolean {
  for (const b of boxes) {
    if (lat < b.minLat || lat > b.maxLat || lon < b.minLon || lon > b.maxLon) {
      continue;
    }
    if (ringContains(lat, lon, b.ring)) return true;
  }
  return false;
}

export function useLandfallEta(
  forecast: ForecastPoint[],
  currentLat: number,
  currentLon: number,
  advisoryNumber: string,
): Landfall | null {
  const [result, setResult] = useState<Landfall | null>(null);

  useEffect(() => {
    let cancelled = false;
    enrichLand(() => {
      if (cancelled) return;
      scheduleIdle(() => {
        if (cancelled) return;
        const boxes = landBoxes();
        if (boxes.length === 0) {
          setResult(null);
          return;
        }
        if (onLand(currentLat, currentLon, boxes)) {
          setResult({ kind: "onshore" });
          return;
        }
        for (const p of forecast) {
          if (onLand(p.lat, p.lon, boxes)) {
            setResult({ kind: "eta", fcstHour: p.fcstHour, validTime: p.validTime });
            return;
          }
        }
        setResult({ kind: "none" });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [forecast, currentLat, currentLon, advisoryNumber]);

  return result;
}
