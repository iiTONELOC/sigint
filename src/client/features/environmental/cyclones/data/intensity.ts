// ── Cyclone intensity-over-time + Rapid Intensification ──────────────
// Pure functions over the forecast track we already have (no new fetch).
// Builds the wind-vs-lead-time series for the dossier sparkline and flags
// Rapid Intensification per the NHC definition: a max-sustained-wind
// increase of >= 30 kt within any 24 h window.

import type { CycloneData } from "../types";

/** One sample on the intensity curve: lead time (h) + max wind (kt). */
export type IntensitySample = {
  /** Hours from the current advisory. 0 = current position. */
  fcstHour: number;
  maxWindKt: number;
};

/** NHC Rapid Intensification threshold: +30 kt over 24 h. */
export const RI_THRESHOLD_KT = 30;
const RI_WINDOW_H = 24;

/**
 * Build the intensity series: the storm's current wind at hour 0 followed by
 * each forecast point's wind, sorted by lead time. Returns [] if there is no
 * usable data.
 */
export function buildIntensitySeries(storm: CycloneData): IntensitySample[] {
  const series: IntensitySample[] = [];
  if (typeof storm.maxWindKt === "number") {
    series.push({ fcstHour: 0, maxWindKt: storm.maxWindKt });
  }
  for (const f of storm.forecast) {
    if (typeof f.maxWindKt === "number") {
      series.push({ fcstHour: f.fcstHour, maxWindKt: f.maxWindKt });
    }
  }
  series.sort((a, b) => a.fcstHour - b.fcstHour);
  return series;
}

export type RapidIntensification = {
  /** True when any 24 h window shows >= RI_THRESHOLD_KT gain. */
  isRapid: boolean;
  /** The largest 24 h wind gain found (kt); 0 if none/insufficient data. */
  maxGain24hKt: number;
  /** Lead time (h) at the end of the window with the largest gain. */
  atFcstHour: number;
};

/**
 * Scan every pair of samples and find the largest wind gain over any window
 * of <= 24 h. NHC forecast points are spaced 12 h early then wider, so a
 * window is any (i, j) pair with (hour_j - hour_i) <= 24.
 */
export function detectRapidIntensification(
  series: IntensitySample[],
): RapidIntensification {
  let maxGain = 0;
  let atHour = 0;
  for (let i = 0; i < series.length; i++) {
    const a = series[i];
    if (!a) continue;
    for (let j = i + 1; j < series.length; j++) {
      const b = series[j];
      if (!b) continue;
      const span = b.fcstHour - a.fcstHour;
      if (span <= 0 || span > RI_WINDOW_H) continue;
      const gain = b.maxWindKt - a.maxWindKt;
      if (gain > maxGain) {
        maxGain = gain;
        atHour = b.fcstHour;
      }
    }
  }
  return {
    isRapid: maxGain >= RI_THRESHOLD_KT,
    maxGain24hKt: maxGain,
    atFcstHour: atHour,
  };
}

/** Peak forecast wind across the series (for the dossier headline). */
export function peakForecastWindKt(series: IntensitySample[]): number {
  return series.reduce((m, s) => Math.max(m, s.maxWindKt), 0);
}

/** Convenience: series + RI verdict in one call. */
export function analyzeIntensity(storm: CycloneData): {
  series: IntensitySample[];
  ri: RapidIntensification;
} {
  const series = buildIntensitySeries(storm);
  return { series, ri: detectRapidIntensification(series) };
}

// Re-export for callers that only need the forecast point type alongside.
export type { ForecastPoint } from "../types";
