import { useState, type PointerEvent } from "react";
import type { TrailPoint } from "@/lib/geo/trails/trailStore";
import { DossierCard, DossierLabel, DossierSectionLabel } from "@/dossier";
import { MS_PER_SECOND } from "@shared/time";
import { formatClockTime, formatDuration } from "@/time";
import { formatKtShort } from "@/measurements";

enum ProfileChartGeometry {
  Width = 100,
  Height = 30,
  MinimumPointCount = 2,
  TimeSegments = 4,
}

const RANGE_PADDING_RATIO = 0.1;

enum ProfileChartClassName {
  Row = "grid grid-cols-1 gap-1 @min-[40rem]/dossier:grid-cols-[5.5rem_minmax(0,1fr)_6.5rem] @min-[40rem]/dossier:gap-3",
  WideOnly = "hidden @min-[40rem]/dossier:flex",
  NarrowOnly = "@min-[40rem]/dossier:hidden",
  Readout = "font-mono text-(length:--sig-text-xs)",
}

const NON_SCALING_STROKE = "non-scaling-stroke";

type ProfileSample = Readonly<{ ts: number; altitude: number; speed: number }>;

type ProfileSeries = Readonly<{
  label: string;
  value: (sample: ProfileSample) => number;
  format: (value: number) => string;
  lineClass: string;
  textClass: string;
}>;

type SeriesRange = Readonly<{ min: number; max: number }>;

type TimeSpan = Readonly<{ first: number; span: number }>;

const PROFILE_SERIES: readonly ProfileSeries[] = [
  {
    label: "ALT",
    value: (sample) => sample.altitude,
    format: (value) => `${Math.round(value).toLocaleString()} ft`,
    lineClass: "stroke-sig-aircraft",
    textClass: "text-sig-aircraft",
  },
  {
    label: "GS",
    value: (sample) => sample.speed,
    format: (value) => formatKtShort(Math.round(value)),
    lineClass: "stroke-sig-accent",
    textClass: "text-sig-accent",
  },
];

function profileSamples(trail: readonly TrailPoint[]): ProfileSample[] {
  return trail.flatMap((point) =>
    point.altitude === undefined || point.speed === undefined
      ? []
      : [{ ts: point.ts, altitude: point.altitude, speed: point.speed }],
  );
}

function seriesRange(samples: readonly ProfileSample[], series: ProfileSeries): SeriesRange {
  const values = samples.map(series.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max };
}

function sampleX(sample: ProfileSample, time: TimeSpan): number {
  return ((sample.ts - time.first) / time.span) * ProfileChartGeometry.Width;
}

function sampleY(value: number, range: SeriesRange): number {
  const padding = (range.max - range.min) * RANGE_PADDING_RATIO || 1;
  const low = range.min - padding;
  const high = range.max + padding;
  return ProfileChartGeometry.Height - ((value - low) / (high - low)) * ProfileChartGeometry.Height;
}

function seriesPath(
  samples: readonly ProfileSample[],
  series: ProfileSeries,
  range: SeriesRange,
  time: TimeSpan,
): string {
  return samples
    .map((sample, index) => {
      const x = sampleX(sample, time).toFixed(2);
      const y = sampleY(series.value(sample), range).toFixed(2);
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

function nearestSampleIndex(samples: readonly ProfileSample[], ts: number): number {
  let nearest = 0;
  samples.forEach((sample, index) => {
    const best = samples[nearest];
    if (best && Math.abs(sample.ts - ts) < Math.abs(best.ts - ts)) nearest = index;
  });
  return nearest;
}

type ProfileStripProps = Readonly<{
  samples: readonly ProfileSample[];
  series: ProfileSeries;
  time: TimeSpan;
  focus: ProfileSample;
  onHover: (fraction: number | null) => void;
}>;

function ProfileStrip({ samples, series, time, focus, onHover }: ProfileStripProps) {
  const range = seriesRange(samples, series);
  const focusX = sampleX(focus, time);
  const hover = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onHover((event.clientX - box.left) / box.width);
  };
  return (
    <div className={`${ProfileChartClassName.Row} items-stretch`}>
      <div className={`${ProfileChartClassName.WideOnly} flex-col justify-between text-right text-sig-dim ${ProfileChartClassName.Readout}`}>
        <span>{series.format(range.max)}</span>
        <span>{series.format(range.min)}</span>
      </div>
      <svg
        viewBox={`0 0 ${ProfileChartGeometry.Width} ${ProfileChartGeometry.Height}`}
        preserveAspectRatio="none"
        className="w-full h-16 border-y border-sig-border/50 touch-none"
        role="img"
        aria-label={`${series.label} over the tracked time`}
        onPointerMove={hover}
        onPointerLeave={() => onHover(null)}
      >
        {Array.from({ length: ProfileChartGeometry.TimeSegments - 1 }, (_, index) => {
          const x = ((index + 1) / ProfileChartGeometry.TimeSegments) * ProfileChartGeometry.Width;
          return <line key={x} x1={x} x2={x} y1={0} y2={ProfileChartGeometry.Height} className="stroke-sig-border" vectorEffect={NON_SCALING_STROKE} />;
        })}
        <path d={seriesPath(samples, series, range, time)} className={`fill-none ${series.lineClass}`} strokeWidth={1.5} vectorEffect={NON_SCALING_STROKE} />
        <line x1={focusX} x2={focusX} y1={0} y2={ProfileChartGeometry.Height} className="stroke-sig-bright/50" vectorEffect={NON_SCALING_STROKE} />
      </svg>
      <div className={`flex items-baseline gap-2 order-first @min-[40rem]/dossier:order-none @min-[40rem]/dossier:flex-col @min-[40rem]/dossier:justify-center @min-[40rem]/dossier:items-start @min-[40rem]/dossier:gap-0 ${ProfileChartClassName.Readout}`}>
        <DossierLabel>{series.label}</DossierLabel>
        <span className={series.textClass}>{series.format(series.value(focus))}</span>
        <span className={`ml-auto text-sig-dim ${ProfileChartClassName.NarrowOnly}`}>
          {series.format(range.min)} – {series.format(range.max)}
        </span>
      </div>
    </div>
  );
}

function TimeAxis({ time }: Readonly<{ time: TimeSpan }>) {
  const labels = Array.from({ length: ProfileChartGeometry.TimeSegments + 1 }, (_, index) => {
    const remaining = time.span * (1 - index / ProfileChartGeometry.TimeSegments);
    return index === ProfileChartGeometry.TimeSegments ? "NOW" : `-${formatDuration(remaining / MS_PER_SECOND)}`;
  });
  return (
    <div className={ProfileChartClassName.Row}>
      <span className={ProfileChartClassName.WideOnly} />
      <div className="flex justify-between">
        {labels.map((label) => <DossierLabel key={label}>{label}</DossierLabel>)}
      </div>
      <span className={ProfileChartClassName.WideOnly} />
    </div>
  );
}

export function AircraftProfileChart({ trail }: Readonly<{ trail: readonly TrailPoint[] }>) {
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const samples = profileSamples(trail);
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last || samples.length < ProfileChartGeometry.MinimumPointCount || last.ts <= first.ts) {
    return null;
  }
  const time: TimeSpan = { first: first.ts, span: last.ts - first.ts };
  const focus = hoverFraction === null
    ? last
    : samples[nearestSampleIndex(samples, time.first + hoverFraction * time.span)] ?? last;
  return (
    <section className="sec profile min-w-0 @min-[40rem]/dossier:col-span-2">
      <div className="flex items-baseline justify-between gap-3">
        <DossierSectionLabel>PROFILE</DossierSectionLabel>
        <DossierLabel>
          {hoverFraction === null ? "NOW" : formatClockTime(focus.ts / MS_PER_SECOND)}
        </DossierLabel>
      </div>
      <DossierCard className="p-3 flex flex-col gap-2">
        {PROFILE_SERIES.map((series) => (
          <ProfileStrip key={series.label} samples={samples} series={series} time={time} focus={focus} onHover={setHoverFraction} />
        ))}
        <TimeAxis time={time} />
      </DossierCard>
    </section>
  );
}
