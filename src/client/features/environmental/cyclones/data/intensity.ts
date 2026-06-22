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

/** Direction of change over the near term. */
export type Trend = "rising" | "falling" | "steady";

/** Semantic tone for a trend: weakening/filling is good (green), the opposite
 *  is bad (red), no change is dim. NOT directional — meaning, not sign. */
export type TrendTone = "good" | "bad" | "dim";
export type TrendLabel = { text: string; tone: TrendTone };

/** Single source for wind/pressure trend display. A weakening storm (falling
 *  wind / rising pressure) is `good`; strengthening is `bad`. */
export const WIND_TREND_LABEL: Record<Trend, TrendLabel> = {
  falling: { text: "↓ weakening", tone: "good" },
  rising: { text: "↑ strengthening", tone: "bad" },
  steady: { text: "→ steady", tone: "dim" },
};
export const PRESS_TREND_LABEL: Record<Trend, TrendLabel> = {
  rising: { text: "↑ rising", tone: "good" },
  falling: { text: "↓ falling", tone: "bad" },
  steady: { text: "→ steady", tone: "dim" },
};

/** Plain-word wind trend (no arrow) for inline prose. Single source so it
 *  always matches WIND_TREND_LABEL's wording. */
export const WIND_TREND_WORD: Record<Trend, string> = {
  falling: "weakening",
  rising: "strengthening",
  steady: "steady",
};

/** Classify a signed wind delta (kt) into a Trend with a ±3kt deadband. */
export function trendFromWindDelta(deltaKt: number): Trend {
  if (deltaKt <= -3) return "falling";
  if (deltaKt >= 3) return "rising";
  return "steady";
}

/**
 * Wind trend now: compares the current sustained wind against the most recent
 * observed past-track point (real history from the ATCF b-deck), falling back to
 * the first forecast point when no past track is loaded yet. `falling` =
 * weakening, `rising` = strengthening.
 */
export function windTrend(storm: CycloneData): Trend {
  // Prefer past history (current − past): rising means it grew.
  const recentPast = storm.pastTrack?.at(-2)?.vmaxKt; // -1 ≈ current analysis
  if (recentPast != null) return trendFromWindDelta(storm.maxWindKt - recentPast);
  // No history yet — read the forecast forward (next − current). The forecast is
  // the FUTURE, so a lower next wind means the storm is weakening.
  const next = storm.forecast[0]?.maxWindKt;
  if (next == null) return "steady";
  return trendFromWindDelta(next - storm.maxWindKt);
}

const PRESS_STEADY_BAND_MB = 1;

type PressureChange = { curMb: number; nextMb: number; leadHours: number };

function pressureChange(storm: CycloneData): PressureChange | null {
  const curMb = storm.minPressureMb;
  if (curMb == null) return null;
  const next = storm.forecast.find((f) => f.minPressureMb != null);
  if (next?.minPressureMb == null) return null;
  return { curMb, nextMb: next.minPressureMb, leadHours: next.fcstHour };
}

/**
 * Pressure trend now: current central pressure vs the first forecast point's
 * minPressure (both real, already plumbed through the feed). Rising pressure =
 * filling = weakening. Returns "steady" when either value is missing.
 */
export function pressureTrend(storm: CycloneData): Trend {
  const change = pressureChange(storm);
  if (!change) return "steady";
  const delta = change.nextMb - change.curMb;
  if (delta >= PRESS_STEADY_BAND_MB) return "rising";
  if (delta <= -PRESS_STEADY_BAND_MB) return "falling";
  return "steady";
}

/**
 * Rate of central-pressure change in hPa per hour (1 mb = 1 hPa), signed:
 * negative = deepening, positive = filling. Null when pressure data or a
 * forecast lead time is missing.
 */
export function pressureRateHpaPerH(storm: CycloneData): number | null {
  const change = pressureChange(storm);
  if (!change || change.leadHours <= 0) return null;
  return (change.nextMb - change.curMb) / change.leadHours;
}

// Re-export for callers that only need the forecast point type alongside.
export type { ForecastPoint } from "../types";
