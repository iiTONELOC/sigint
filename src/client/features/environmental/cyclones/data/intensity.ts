// ── Cyclone intensity-over-time + Rapid Intensification ──────────────
// Pure functions over the forecast track we already have (no new fetch).
// Builds the wind-vs-lead-time series for the dossier sparkline and flags
// Rapid Intensification per the NHC definition: a max-sustained-wind
// increase of >= 30 kt within any 24 h window.

import type { CycloneData, PastTrackPoint } from "../types";
import { MS_PER_HOUR } from "@shared/time";

/** One sample on the intensity curve: lead time (h) + max wind (kt). */
export type IntensitySample = {
  /** Hours from the current advisory. 0 = current position. */
  fcstHour: number;
  maxWindKt: number;
};

export enum CycloneRapidIntensificationPolicy {
  ThresholdKnots = 30,
  WindowHours = 24,
}

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
      if (
        span <= 0 ||
        span > CycloneRapidIntensificationPolicy.WindowHours
      ) continue;
      const gain = b.maxWindKt - a.maxWindKt;
      if (gain > maxGain) {
        maxGain = gain;
        atHour = b.fcstHour;
      }
    }
  }
  return {
    isRapid:
      maxGain >= CycloneRapidIntensificationPolicy.ThresholdKnots,
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

export enum CycloneTrend {
  Rising = "rising",
  Falling = "falling",
  Steady = "steady",
  Unknown = "unknown",
}

export enum CycloneTrendTone {
  Good = "good",
  Bad = "bad",
  Dim = "dim",
}

export type TrendLabel = {
  text: string;
  tone: CycloneTrendTone;
  observed: boolean;
};

type TrendMeta = Readonly<{
  wind: TrendLabel;
  pressure: TrendLabel;
  windWord: string | null;
}>;

const TREND_META: Readonly<Record<CycloneTrend, TrendMeta>> = {
  [CycloneTrend.Falling]: {
    wind: {
      text: "↓ weakening",
      tone: CycloneTrendTone.Good,
      observed: true,
    },
    pressure: {
      text: "↓ falling",
      tone: CycloneTrendTone.Bad,
      observed: true,
    },
    windWord: "weakening",
  },
  [CycloneTrend.Rising]: {
    wind: {
      text: "↑ strengthening",
      tone: CycloneTrendTone.Bad,
      observed: true,
    },
    pressure: {
      text: "↑ rising",
      tone: CycloneTrendTone.Good,
      observed: true,
    },
    windWord: "strengthening",
  },
  [CycloneTrend.Steady]: {
    wind: {
      text: "→ steady",
      tone: CycloneTrendTone.Dim,
      observed: true,
    },
    pressure: {
      text: "→ steady",
      tone: CycloneTrendTone.Dim,
      observed: true,
    },
    windWord: "steady",
  },
  [CycloneTrend.Unknown]: {
    wind: {
      text: "trend unavailable",
      tone: CycloneTrendTone.Dim,
      observed: false,
    },
    pressure: {
      text: "trend unavailable",
      tone: CycloneTrendTone.Dim,
      observed: false,
    },
    windWord: null,
  },
};

export function windTrendLabel(trend: CycloneTrend): TrendLabel {
  return TREND_META[trend].wind;
}

export function pressureTrendLabel(trend: CycloneTrend): TrendLabel {
  return TREND_META[trend].pressure;
}

export function windTrendWord(trend: CycloneTrend): string | null {
  return TREND_META[trend].windWord;
}

/** Classify a signed wind delta (kt) into a Trend with a ±3kt deadband. */
enum TrendPolicy {
  WindDeadbandKnots = 3,
  PressureSteadyBandMb = 1,
}

export function trendFromWindDelta(deltaKt: number): CycloneTrend {
  if (deltaKt <= -TrendPolicy.WindDeadbandKnots) return CycloneTrend.Falling;
  if (deltaKt >= TrendPolicy.WindDeadbandKnots) return CycloneTrend.Rising;
  return CycloneTrend.Steady;
}

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

export function windTrend(storm: CycloneData): CycloneTrend {
  const previous = previousObservedPoint(storm);
  return previous
    ? trendFromWindDelta(storm.maxWindKt - previous.point.vmaxKt)
    : CycloneTrend.Unknown;
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
    elapsedHours: (currentTime - previous.observedAt) / MS_PER_HOUR,
  };
}

export function pressureTrend(storm: CycloneData): CycloneTrend {
  const change = pressureChange(storm);
  if (!change) return CycloneTrend.Unknown;
  const delta = change.currentMb - change.previousMb;
  if (delta >= TrendPolicy.PressureSteadyBandMb) return CycloneTrend.Rising;
  if (delta <= -TrendPolicy.PressureSteadyBandMb) return CycloneTrend.Falling;
  return CycloneTrend.Steady;
}

export function pressureRateHpaPerH(storm: CycloneData): number | null {
  const change = pressureChange(storm);
  if (!change || change.elapsedHours <= 0) return null;
  return (change.currentMb - change.previousMb) / change.elapsedHours;
}

// Re-export for callers that only need the forecast point type alongside.
export type { ForecastPoint } from "../types";
