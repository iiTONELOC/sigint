import { useId, type CSSProperties, type ReactNode } from "react";
import { TrendingUp } from "lucide-react";
import { formatKtShort } from "@/measurements";
import {
  Category,
  CYCLONE_CATEGORY_METADATA,
  cycloneCategoryShortLabel,
  type CycloneData,
} from "@shared/domain/cyclones";
import {
  analyzeIntensity,
  CycloneRapidIntensificationPolicy,
  peakForecastWindKt,
} from "../data/intensity";
import {
  SAFFIR_SIMPSON,
  windColor,
} from "../classification";
import { DossierLabel, DossierTextClass } from "@/dossier";

enum IntensityChartGeometry {
  Width = 260,
  Height = 90,
  HorizontalPadding = 4,
  TopPadding = 6,
  BottomPadding = 3,
  MaximumKnots = 150,
}

enum ChartInk {
  LineCap = "round",
  Bright = "var(--sigint-bright, #cdd9ec)",
  Dim = "var(--sigint-dim, #8aa)",
  None = "none",
  FixedStroke = "non-scaling-stroke",
}

enum ForecastTickPolicy {
  EveryPointLimit = 6,
  Stride = 2,
}

export enum IntensityFactLabel {
  BiggestGain = "BIGGEST 24H GAIN",
  Formed = "FORMED",
  LowestPressure = "LOWEST PRESSURE",
  PeakAt = "PEAK AT",
}

export type IntensityPoint = Readonly<{ hour: number; windKt: number }>;
export type IntensityFact = readonly [label: string, value: string];

type IntensityScale = Readonly<{ x: (hour: number) => number; y: (windKt: number) => number }>;

export type IntensityChartProps = Readonly<{
  alert?: ReactNode;
  ariaLabel: string;
  count: string;
  facts: readonly IntensityFact[];
  lineColor: string;
  markerHour: number | null;
  nowHour: number | null;
  points: readonly IntensityPoint[];
  ticks: readonly number[];
}>;

export const CYCLONE_CHART_HEIGHT_CLASS = "h-28 @min-[28rem]/dossier:h-36";
const CHART_LABEL_TEXT = "font-mono leading-none text-(length:--sig-text-xs)";
const CHART_LABEL_CLASS = `absolute ${CHART_LABEL_TEXT}`;
const FACT_VALUE_CLASS = `min-w-0 text-right ${DossierTextClass.Value}`;
const PERCENT = 100;
const CHART_BASELINE = IntensityChartGeometry.Height - IntensityChartGeometry.BottomPadding;
const CHART_RIGHT = IntensityChartGeometry.Width - IntensityChartGeometry.HorizontalPadding;

export function chartPercent(value: number, span: number): string {
  return `${(value / span) * PERCENT}%`;
}

const SS_BANDS = [
  ...SAFFIR_SIMPSON.map((b) => ({ label: b.label, kt: b.minKt })),
  {
    label: cycloneCategoryShortLabel(Category.TropicalStorm),
    kt: CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt,
  },
].filter((band) => band.kt <= IntensityChartGeometry.MaximumKnots);

function intensityScale(points: readonly IntensityPoint[]): IntensityScale {
  const hours = points.map((point) => point.hour);
  const minHour = Math.min(...hours);
  const span = Math.max(...hours) - minHour || 1;
  const plotWidth = CHART_RIGHT - IntensityChartGeometry.HorizontalPadding;
  const plotHeight = CHART_BASELINE - IntensityChartGeometry.TopPadding;
  return {
    x: (hour) => IntensityChartGeometry.HorizontalPadding + ((hour - minHour) / span) * plotWidth,
    y: (windKt) => IntensityChartGeometry.TopPadding +
      (1 - Math.min(windKt, IntensityChartGeometry.MaximumKnots) / IntensityChartGeometry.MaximumKnots) * plotHeight,
  };
}

function bandTop(scale: IntensityScale, index: number): number {
  return scale.y(SS_BANDS[index - 1]?.kt ?? IntensityChartGeometry.MaximumKnots);
}

function CategoryBands({ scale }: Readonly<{ scale: IntensityScale }>) {
  return SS_BANDS.map((band, index) => {
    const top = scale.y(band.kt);
    return (
      <g key={band.label}>
        <rect
          x={IntensityChartGeometry.HorizontalPadding}
          y={top}
          width={CHART_RIGHT - IntensityChartGeometry.HorizontalPadding}
          height={Math.max(0, bandTop(scale, index) - top)}
          fill={windColor(band.kt)}
          fillOpacity={0.1}
        />
        <line
          x1={IntensityChartGeometry.HorizontalPadding}
          x2={CHART_RIGHT}
          y1={top}
          y2={top}
          stroke={windColor(band.kt)}
          strokeOpacity={0.3}
          strokeDasharray="2 3"
          vectorEffect={ChartInk.FixedStroke}
        />
      </g>
    );
  });
}

function HourLine({ x, color, dashed }: Readonly<{ x: number; color: string; dashed: boolean }>) {
  return (
    <line
      x1={x}
      x2={x}
      y1={IntensityChartGeometry.TopPadding}
      y2={CHART_BASELINE}
      stroke={color}
      strokeOpacity={dashed ? 0.5 : 1}
      strokeDasharray={dashed ? "2 2" : undefined}
      strokeWidth={dashed ? 1 : 1.25}
      vectorEffect={ChartInk.FixedStroke}
    />
  );
}

function IntensityPath({ points, scale, lineColor }: Readonly<{ points: readonly IntensityPoint[]; scale: IntensityScale; lineColor: string }>) {
  const gradientId = useId();
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  const line = points
    .map((point, i) => `${i === 0 ? "M" : "L"}${scale.x(point.hour).toFixed(1)},${scale.y(point.windKt).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${scale.x(last.hour).toFixed(1)},${CHART_BASELINE.toFixed(1)} L${scale.x(first.hour).toFixed(1)},${CHART_BASELINE.toFixed(1)} Z`;
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
          <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill={ChartInk.None}
        stroke={lineColor}
        strokeWidth={1.75}
        vectorEffect={ChartInk.FixedStroke}
        strokeLinejoin={ChartInk.LineCap}
        strokeLinecap={ChartInk.LineCap}
      />
      {points.map((point) => (
        <circle key={point.hour} cx={scale.x(point.hour)} cy={scale.y(point.windKt)} r={2} fill={windColor(point.windKt)} stroke="#000" strokeWidth={0.4} />
      ))}
    </>
  );
}

function TickMarks({ scale, ticks }: Readonly<{ scale: IntensityScale; ticks: readonly number[] }>) {
  return ticks.map((hour) => (
    <line key={hour} x1={scale.x(hour)} x2={scale.x(hour)} y1={CHART_BASELINE} y2={CHART_BASELINE + 2} stroke={ChartInk.Dim} strokeOpacity={0.6} />
  ));
}

function LabelColumnSizer() {
  return <span className={`${CHART_LABEL_TEXT} invisible`} aria-hidden>{SS_BANDS[0]?.label}</span>;
}

function CategoryLabels({ scale }: Readonly<{ scale: IntensityScale }>) {
  return (
    <div className="relative">
      <LabelColumnSizer />
      {SS_BANDS.map((band, index) => (
        <span
          key={band.label}
          className={`${CHART_LABEL_CLASS} left-0 top-(--y) -translate-y-1/2`}
          style={{
            "--y": chartPercent((scale.y(band.kt) + bandTop(scale, index)) / 2, IntensityChartGeometry.Height),
            color: windColor(band.kt),
          } as CSSProperties}
        >
          {band.label}
        </span>
      ))}
    </div>
  );
}

function HourLabels({ scale, ticks }: Readonly<{ scale: IntensityScale; ticks: readonly number[] }>) {
  return (
    <div className="relative flex-1 min-w-0 h-4">
      {ticks.map((hour) => (
        <span
          key={hour}
          className={`${CHART_LABEL_CLASS} left-(--x) -translate-x-1/2 text-sig-dim`}
          style={{ "--x": chartPercent(scale.x(hour), IntensityChartGeometry.Width) } as CSSProperties}
        >
          {hour}
        </span>
      ))}
    </div>
  );
}

function IntensityFacts({ facts }: Readonly<{ facts: readonly IntensityFact[] }>) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-dashed border-sig-border">
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <DossierLabel>{label}</DossierLabel>
          <span className={FACT_VALUE_CLASS}>{value}</span>
        </div>
      ))}
    </div>
  );
}

/** Wind over time on the Saffir-Simpson scale, shared by the forecast and best-track history. */
export function IntensityChart({ alert, ariaLabel, count, facts, lineColor, markerHour, nowHour, points, ticks }: IntensityChartProps) {
  const scale = intensityScale(points);
  const peak = Math.max(...points.map((point) => point.windKt));
  return (
    <div>
      <div className="flex flex-wrap justify-between gap-x-3 mb-1.5">
        <DossierLabel className="text-(--dossier-accent)">INTENSITY · PEAK {formatKtShort(peak)}</DossierLabel>
        <DossierLabel>{count}</DossierLabel>
      </div>
      {alert}
      <div className="flex gap-1">
        <div className="relative flex-1 min-w-0">
        <svg
          viewBox={`0 0 ${IntensityChartGeometry.Width} ${IntensityChartGeometry.Height}`}
          preserveAspectRatio={ChartInk.None}
          className={`w-full ${CYCLONE_CHART_HEIGHT_CLASS}`}
          aria-label={ariaLabel}
        >
          <CategoryBands scale={scale} />
          {nowHour !== null && <HourLine x={scale.x(nowHour) + 1} color={ChartInk.Bright} dashed />}
          {markerHour !== null && <HourLine x={scale.x(markerHour)} color={lineColor} dashed={false} />}
          <IntensityPath points={points} scale={scale} lineColor={lineColor} />
          <TickMarks scale={scale} ticks={ticks} />
        </svg>
        {nowHour !== null && <span className={`${CHART_LABEL_CLASS} left-2 top-1 text-sig-bright`}>NOW</span>}
        </div>
        <CategoryLabels scale={scale} />
      </div>
      <div className="flex gap-1 mt-1">
        <HourLabels scale={scale} ticks={ticks} />
        <LabelColumnSizer />
      </div>
      <IntensityFacts facts={facts} />
    </div>
  );
}

function RapidIntensificationAlert({ gainKt }: Readonly<{ gainKt: number }>) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded text-(length:--sig-text-xs) font-mono font-semibold tracking-wider border border-sig-warn/60 text-sig-warn bg-sig-warn/12">
      <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
      RAPID INTENSIFICATION · +{formatKtShort(gainKt)}/{CycloneRapidIntensificationPolicy.WindowHours}h
    </div>
  );
}

function forecastTicks(hours: readonly number[]): number[] {
  return hours.filter((hour, index) =>
    hour > 0 && (hours.length <= ForecastTickPolicy.EveryPointLimit || index % ForecastTickPolicy.Stride === 1));
}

export function CycloneIntensityCurve({
  storm,
  markerHour,
}: { readonly storm: CycloneData; readonly markerHour?: number }) {
  const { series, ri } = analyzeIntensity(storm);
  const first = series[0];
  const last = series.at(-1);
  if (series.length < 2 || !first || !last) return null;
  const peak = peakForecastWindKt(series);
  const peakSample = series.find((sample) => sample.maxWindKt === peak) ?? first;
  const peakTime = peakSample.fcstHour === 0 ? "now" : `+${peakSample.fcstHour}h`;
  const endLabel = `+${last.fcstHour}H`;
  return (
    <IntensityChart
      alert={ri.isRapid ? <RapidIntensificationAlert gainKt={ri.maxGain24hKt} /> : null}
      ariaLabel={`Forecast intensity: peak ${peak} knots at ${peakTime}, ${last.maxWindKt} knots at ${last.fcstHour} hours`}
      count={endLabel}
      facts={[
        [IntensityFactLabel.PeakAt, peakTime],
        [`AT ${endLabel}`, formatKtShort(last.maxWindKt)],
        [IntensityFactLabel.BiggestGain, `+${formatKtShort(ri.maxGain24hKt)}`],
      ]}
      lineColor={ri.isRapid ? "var(--sigint-cycWatch)" : windColor(first.maxWindKt)}
      markerHour={markerHour ?? null}
      nowHour={first.fcstHour}
      points={series.map((sample) => ({ hour: sample.fcstHour, windKt: sample.maxWindKt }))}
      ticks={forecastTicks(series.map((sample) => sample.fcstHour))}
    />
  );
}
