// ── Cyclone intensity-over-time + Rapid Intensification ──────────────
// Pure functions over the forecast track we already have (no new fetch).
// Builds the wind-vs-lead-time series for the dossier sparkline and flags
// Rapid Intensification per the NHC definition: a max-sustained-wind
// increase of >= 30 kt within any 24 h window.

import type { CycloneData, PastTrackPoint } from "../types";

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
export type ObservedTrend = Trend | "unknown";

/** Semantic tone for a trend: weakening/filling is good (green), the opposite
 *  is bad (red), no change is dim. NOT directional — meaning, not sign. */
export type TrendTone = "good" | "bad" | "dim";
export type TrendLabel = { text: string; tone: TrendTone };

/** Single source for wind/pressure trend display. A weakening storm (falling
 *  wind / rising pressure) is `good`; strengthening is `bad`. */
export const WIND_TREND_LABEL: Record<ObservedTrend, TrendLabel> = {
  falling: { text: "↓ weakening", tone: "good" },
  rising: { text: "↑ strengthening", tone: "bad" },
  steady: { text: "→ steady", tone: "dim" },
  unknown: { text: "trend unavailable", tone: "dim" },
};
export const PRESS_TREND_LABEL: Record<ObservedTrend, TrendLabel> = {
  rising: { text: "↑ rising", tone: "good" },
  falling: { text: "↓ falling", tone: "bad" },
  steady: { text: "→ steady", tone: "dim" },
  unknown: { text: "trend unavailable", tone: "dim" },
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

const PRESS_STEADY_BAND_MB = 1;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const ATCF_TIMESTAMP = /^(\d{4})(\d{2})(\d{2})(\d{2})$/;

type TimedPastTrackPoint = Readonly<{
  point: PastTrackPoint;
  observedAt: number;
}>;

function cycloneTimestamp(value: string): number | null {
  const atcf = ATCF_TIMESTAMP.exec(value);
  if (atcf) {
    const year = atcf[1];
    const month = atcf[2];
    const day = atcf[3];
    const hour = atcf[4];
    if (!year || !month || !day || !hour) return null;
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
    );
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function previousObservedPoint(storm: CycloneData): TimedPastTrackPoint | null {
  const currentTime = cycloneTimestamp(storm.lastUpdate);
  if (currentTime === null) return null;
  let previous: TimedPastTrackPoint | null = null;
  for (const point of storm.pastTrack ?? []) {
    const observedAt = cycloneTimestamp(point.validTime);
    if (observedAt === null || observedAt >= currentTime) continue;
    if (!previous || observedAt > previous.observedAt) {
      previous = { point, observedAt };
    }
  }
  return previous;
}

export function windTrend(storm: CycloneData): ObservedTrend {
  const previous = previousObservedPoint(storm);
  return previous
    ? trendFromWindDelta(storm.maxWindKt - previous.point.vmaxKt)
    : "unknown";
}

type PressureChange = Readonly<{
  currentMb: number;
  previousMb: number;
  elapsedHours: number;
}>;

function pressureChange(storm: CycloneData): PressureChange | null {
  const currentMb = storm.minPressureMb;
  const previous = previousObservedPoint(storm);
  const previousMb = previous?.point.minPressureMb;
  const currentTime = cycloneTimestamp(storm.lastUpdate);
  if (
    currentMb == null ||
    previousMb == null ||
    !previous ||
    currentTime === null
  ) {
    return null;
  }
  return {
    currentMb,
    previousMb,
    elapsedHours: (currentTime - previous.observedAt) / MILLISECONDS_PER_HOUR,
  };
}

export function pressureTrend(storm: CycloneData): ObservedTrend {
  const change = pressureChange(storm);
  if (!change) return "unknown";
  const delta = change.currentMb - change.previousMb;
  if (delta >= PRESS_STEADY_BAND_MB) return "rising";
  if (delta <= -PRESS_STEADY_BAND_MB) return "falling";
  return "steady";
}

export function pressureRateHpaPerH(storm: CycloneData): number | null {
  const change = pressureChange(storm);
  if (!change || change.elapsedHours <= 0) return null;
  return (change.currentMb - change.previousMb) / change.elapsedHours;
}

// Re-export for callers that only need the forecast point type alongside.
export type { ForecastPoint } from "../types";
