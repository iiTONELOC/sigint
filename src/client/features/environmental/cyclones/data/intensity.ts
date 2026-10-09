import { cycloneTimeMs, type CycloneData, type PastTrackPoint } from "@shared/domain/cyclones";
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

enum TrendPolicy {
  WindDeadbandKnots = 3,
  PressureSteadyBandMb = 1,
}

export function trendFromWindDelta(deltaKt: number): CycloneTrend {
  if (deltaKt <= -TrendPolicy.WindDeadbandKnots) return CycloneTrend.Falling;
  if (deltaKt >= TrendPolicy.WindDeadbandKnots) return CycloneTrend.Rising;
  return CycloneTrend.Steady;
}

type TimedPastTrackPoint = Readonly<{
  point: PastTrackPoint;
  observedAt: number;
}>;

function cycloneTimestamp(value: string): number | null {
  const timestamp = cycloneTimeMs(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

type NewestFixes = Readonly<{
  latest: TimedPastTrackPoint;
  previous: TimedPastTrackPoint;
}>;

// The trend compares the two newest best-track fixes, so a fix newer than the advisory still counts.
function newestFixes(storm: CycloneData): NewestFixes | null {
  const timed = (storm.pastTrack ?? []).flatMap((point) => {
    const observedAt = cycloneTimestamp(point.validTime);
    return observedAt === null ? [] : [{ point, observedAt }];
  }).sort((left, right) => right.observedAt - left.observedAt);
  const latest = timed[0];
  const previous = timed.find((fix) => latest && fix.observedAt < latest.observedAt);
  return latest && previous ? { latest, previous } : null;
}

export function trendWindowHours(storm: CycloneData): number | null {
  const fixes = newestFixes(storm);
  return fixes ? (fixes.latest.observedAt - fixes.previous.observedAt) / MS_PER_HOUR : null;
}

/** The newest best-track fix when it is newer than the advisory, else null. */
export function fixNewerThanAdvisory(storm: CycloneData): PastTrackPoint | null {
  const fixes = newestFixes(storm);
  const advisoryTime = cycloneTimestamp(storm.lastUpdate);
  if (!fixes || advisoryTime === null) return null;
  return fixes.latest.observedAt > advisoryTime ? fixes.latest.point : null;
}

export function windTrend(storm: CycloneData): CycloneTrend {
  const fixes = newestFixes(storm);
  return fixes
    ? trendFromWindDelta(fixes.latest.point.vmaxKt - fixes.previous.point.vmaxKt)
    : CycloneTrend.Unknown;
}

type PressureChange = Readonly<{
  currentMb: number;
  previousMb: number;
  elapsedHours: number;
}>;

function pressureChange(storm: CycloneData): PressureChange | null {
  const fixes = newestFixes(storm);
  const currentMb = fixes?.latest.point.minPressureMb;
  const previousMb = fixes?.previous.point.minPressureMb;
  if (!fixes || currentMb == null || previousMb == null) return null;
  return {
    currentMb,
    previousMb,
    elapsedHours: (fixes.latest.observedAt - fixes.previous.observedAt) / MS_PER_HOUR,
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

export type TrackHistorySample = Readonly<{ observedAt: number; windKt: number }>;

export type TrackHistory = Readonly<{
  formedAt: number;
  peakWindKt: number;
  lowestPressureMb: number | null;
  maxGain24hKt: number;
  series: readonly TrackHistorySample[];
}>;

/** Best-track history: formation time, peak wind, lowest pressure, and the largest 24h wind gain. */
export function trackHistory(storm: CycloneData): TrackHistory | null {
  const fixes = (storm.pastTrack ?? []).flatMap((point) => {
    const observedAt = cycloneTimestamp(point.validTime);
    return observedAt === null ? [] : [{ point, observedAt }];
  }).sort((left, right) => left.observedAt - right.observedAt);
  const first = fixes[0];
  if (!first) return null;
  const pressures = fixes.flatMap(({ point }) => point.minPressureMb == null ? [] : [point.minPressureMb]);
  const series = fixes.map(({ point, observedAt }) => ({ observedAt, windKt: point.vmaxKt }));
  const gain = detectRapidIntensification(series.map((sample) => ({
    fcstHour: (sample.observedAt - first.observedAt) / MS_PER_HOUR,
    maxWindKt: sample.windKt,
  })));
  return {
    formedAt: first.observedAt,
    peakWindKt: Math.max(...series.map((sample) => sample.windKt)),
    lowestPressureMb: pressures.length > 0 ? Math.min(...pressures) : null,
    maxGain24hKt: gain.maxGain24hKt,
    series,
  };
}
