import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format/timeFormat";
import { enrichLand } from "@/lib/geo/landService";
import { scheduleIdle } from "@/lib/runtime/idle";
import { createGeoPoint, type GeoMultiPolygon } from "@shared/geo";
import {
  assessLandfall,
  createLandfallIndex,
  type LandfallAssessment,
  type LandfallIndex,
} from "../data/landfall";
import type { ForecastPoint } from "../types";

export type Landfall = LandfallAssessment;

export type LandfallTone = "critical" | "forecast" | "neutral";

type LandfallText = Readonly<{ text: string; tone: LandfallTone }>;

let indexCache: Readonly<{
  land: GeoMultiPolygon;
  index: LandfallIndex;
}> | null = null;

function landfallIndex(land: GeoMultiPolygon): LandfallIndex {
  if (indexCache?.land === land) return indexCache.index;
  const index = createLandfallIndex(land);
  indexCache = { land, index };
  return index;
}

export function landfallText(landfall: Landfall): LandfallText {
  if (landfall.kind === "onshore") {
    return { text: "Onshore now", tone: "critical" };
  }
  if (landfall.kind === "none") {
    return { text: "None in forecast", tone: "neutral" };
  }
  if (landfall.kind === "indeterminate") {
    return { text: "Unavailable", tone: "neutral" };
  }
  return {
    text: `≈ +${Math.round(landfall.fcstHour)}h · ${formatTime(landfall.validTime)}`,
    tone: "forecast",
  };
}

export function useLandfallEta(
  forecast: readonly ForecastPoint[],
  currentLatitude: number,
  currentLongitude: number,
  advisoryNumber: string,
  advisoryTime: string,
): Landfall | null {
  const [result, setResult] = useState<Landfall | null>(null);

  useEffect(() => {
    let cancelled = false;
    enrichLand((land) => {
      if (cancelled) return;
      scheduleIdle(() => {
        if (cancelled) return;
        const current = createGeoPoint(currentLongitude, currentLatitude);
        setResult(
          current
            ? assessLandfall(
                current,
                advisoryTime,
                forecast,
                landfallIndex(land),
              )
            : { kind: "indeterminate" },
        );
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    advisoryNumber,
    advisoryTime,
    currentLatitude,
    currentLongitude,
    forecast,
  ]);

  return result;
}
