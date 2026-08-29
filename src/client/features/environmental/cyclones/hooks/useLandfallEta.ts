import { useEffect, useState } from "react";
import { formatTime } from "@/time";
import { enrichLand } from "@/lib/geo/landService";
import { scheduleIdle } from "@/lib/runtime/idle";
import { createGeoPoint, type GeoMultiPolygon } from "@shared/geo";
import {
  assessLandfall,
  createLandfallIndex,
  type Landfall,
  type LandfallIndex,
  LandfallKind,
} from "../data/landfall";
import type { ForecastPoint } from "@shared/domain/cyclones";

export enum LandfallTone {
  Critical = "critical",
  Forecast = "forecast",
  Neutral = "neutral",
}

enum LandfallCopy {
  Onshore = "Onshore now",
  None = "None in forecast",
  Unavailable = "Unavailable",
}

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
  if (landfall.kind === LandfallKind.Onshore) {
    return { text: LandfallCopy.Onshore, tone: LandfallTone.Critical };
  }
  if (landfall.kind === LandfallKind.None) {
    return { text: LandfallCopy.None, tone: LandfallTone.Neutral };
  }
  if (landfall.kind === LandfallKind.Indeterminate) {
    return { text: LandfallCopy.Unavailable, tone: LandfallTone.Neutral };
  }
  return {
    text: `≈ +${Math.round(landfall.fcstHour)}h · ${formatTime(landfall.validTime)}`,
    tone: LandfallTone.Forecast,
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
            : { kind: LandfallKind.Indeterminate },
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
