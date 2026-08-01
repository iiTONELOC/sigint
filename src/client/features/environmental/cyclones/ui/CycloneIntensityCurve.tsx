import { useId } from "react";
import { TrendingUp } from "lucide-react";
import { formatKtShort } from "@/measurements";
import type { CycloneData } from "../types";
import {
  analyzeIntensity,
  peakForecastWindKt,
} from "../data/intensity";
import {
  CycloneBandLabel,
  CycloneWindThreshold,
  SAFFIR_SIMPSON,
  windColor,
} from "../classification";

enum IntensityChartGeometry {
  Width = 260,
  Height = 90,
  HorizontalPadding = 4,
  TopPadding = 6,
  BottomPadding = 12,
  MaximumKnots = 150,
}

// Saffir-Simpson lower bounds (kt). Bands shade the chart so a viewer reads
// the line's height as a category, not just a number.
const SS_BANDS = [
  ...SAFFIR_SIMPSON.map((b) => ({ label: b.label, kt: b.minKt })),
  {
    label: CycloneBandLabel.TropicalStorm,
    kt: CycloneWindThreshold.TropicalStorm,
  },
];

export function CycloneIntensityCurve({ storm }: { readonly storm: CycloneData }) {
  const gradientId = useId();
  const { series, ri } = analyzeIntensity(storm);

  if (series.length < 2) return null;
  const [firstSample, ...remainingSamples] = series;
  if (!firstSample) return null;

  const hours = series.map((s) => s.fcstHour);
  const winds = series.map((s) => s.maxWindKt);
  const minH = Math.min(...hours);
  const maxH = Math.max(...hours);
  const peak = peakForecastWindKt(series);
  const peakSample = remainingSamples.reduce(
    (highest, sample) =>
      sample.maxWindKt > highest.maxWindKt ? sample : highest,
    firstSample,
  );
  const firstW = winds[0] ?? 0;
  const lastW = winds.at(-1) ?? 0;
  const peakTime =
    peakSample.fcstHour === 0 ? "now" : `+${peakSample.fcstHour}h`;

  const spanH = maxH - minH || 1;
  const plotH = IntensityChartGeometry.Height -
    IntensityChartGeometry.TopPadding -
    IntensityChartGeometry.BottomPadding;

  const x = (h: number) => IntensityChartGeometry.HorizontalPadding +
    ((h - minH) / spanH) * (
      IntensityChartGeometry.Width -
      2 * IntensityChartGeometry.HorizontalPadding
    );
  const y = (w: number) => IntensityChartGeometry.TopPadding +
    (
      1 -
      Math.min(w, IntensityChartGeometry.MaximumKnots) /
        IntensityChartGeometry.MaximumKnots
    ) * plotH;

  const line = series
    .map((s, i) => `${i === 0 ? "M" : "L"}${x(s.fcstHour).toFixed(1)},${y(s.maxWindKt).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(maxH).toFixed(1)},${(
    IntensityChartGeometry.Height - IntensityChartGeometry.BottomPadding
  ).toFixed(1)} L${x(minH).toFixed(1)},${(
    IntensityChartGeometry.Height - IntensityChartGeometry.BottomPadding
  ).toFixed(1)} Z`;

  const lineColor = ri.isRapid ? "var(--sigint-cycWatch)" : windColor(firstW);

  const yKt = (kt: number) => y(
    Math.min(kt, IntensityChartGeometry.MaximumKnots),
  );

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-(length:--sig-text-xs) font-mono tracking-widest text-(--dossier-accent)">
          INTENSITY
        </span>
        <span className="text-(length:--sig-text-xs) font-mono text-sig-text text-right pl-2">
          peak {formatKtShort(peak)} {peakTime} · +{maxH}h {formatKtShort(lastW)}
        </span>
      </div>

      {ri.isRapid && (
        <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded text-(length:--sig-text-xs) font-mono font-semibold tracking-wider border border-sig-warn/60 text-sig-warn bg-sig-warn/12">
          <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
          RAPID INTENSIFICATION · +{formatKtShort(ri.maxGain24hKt)}/24h
        </div>
      )}

      <svg
        viewBox={`0 0 ${IntensityChartGeometry.Width} ${IntensityChartGeometry.Height}`}
        preserveAspectRatio="none"
        className="w-full h-28 @min-[28rem]/dossier:h-36"
        aria-label={`Forecast intensity: peak ${peak} knots at ${peakTime}, ${lastW} knots at ${maxH} hours${
          ri.isRapid ? `, rapid intensification +${ri.maxGain24hKt} knots per 24 hours` : ""
        }`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {SS_BANDS.map((b, i) => {
          if (b.kt > IntensityChartGeometry.MaximumKnots) return null;
          const top = yKt(b.kt);
          const prevKt = SS_BANDS[i - 1]?.kt ??
            IntensityChartGeometry.MaximumKnots;
          const bottom = yKt(
            Math.min(prevKt, IntensityChartGeometry.MaximumKnots),
          );
          return (
            <g key={b.label}>
              <rect
                x={IntensityChartGeometry.HorizontalPadding}
                y={top}
                width={
                  IntensityChartGeometry.Width -
                  2 * IntensityChartGeometry.HorizontalPadding
                }
                height={Math.max(0, bottom - top)}
                fill={windColor(b.kt)}
                fillOpacity={0.1}
              />
              <line
                x1={IntensityChartGeometry.HorizontalPadding}
                x2={
                  IntensityChartGeometry.Width -
                  IntensityChartGeometry.HorizontalPadding
                }
                y1={top}
                y2={top}
                stroke={windColor(b.kt)}
                strokeOpacity={0.3}
                strokeDasharray="2 3"
              />
              <text
                x={
                  IntensityChartGeometry.Width -
                  IntensityChartGeometry.HorizontalPadding
                }
                y={top + 6}
                textAnchor="end"
                fontSize={6}
                fill={windColor(b.kt)}
                fillOpacity={0.8}
                fontFamily="monospace"
              >
                {b.label}
              </text>
            </g>
          );
        })}

        {(() => {
          const nx = x(minH) + 1;
          return (
            <g>
              <line
                x1={nx}
                x2={nx}
                y1={IntensityChartGeometry.TopPadding}
                y2={
                  IntensityChartGeometry.Height -
                  IntensityChartGeometry.BottomPadding
                }
                stroke="var(--sigint-bright, #cdd9ec)"
                strokeOpacity={0.5}
                strokeDasharray="2 2"
              />
              <text
                x={nx + 2}
                y={
                  IntensityChartGeometry.TopPadding +
                  IntensityChartGeometry.TopPadding
                }
                fontSize={6}
                fill="var(--sigint-bright, #cdd9ec)"
                fillOpacity={0.7}
                fontFamily="monospace"
              >
                NOW
              </text>
            </g>
          );
        })()}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {series.map((s) => (
          <circle
            key={s.fcstHour}
            cx={x(s.fcstHour)}
            cy={y(s.maxWindKt)}
            r={2}
            fill={windColor(s.maxWindKt)}
            stroke="#000"
            strokeWidth={0.4}
          />
        ))}

        {series.map((s, i) => {
          if (s.fcstHour <= 0) return null;
          const forecastCount = series.length - 1; // exclude hour 0
          const showLabel = forecastCount <= 5 || i % 2 === 1;
          const tx = x(s.fcstHour);
          return (
            <g key={`tick-${s.fcstHour}`}>
              <line
                x1={tx}
                x2={tx}
                y1={
                  IntensityChartGeometry.Height -
                  IntensityChartGeometry.BottomPadding
                }
                y2={
                  IntensityChartGeometry.Height -
                  IntensityChartGeometry.BottomPadding + 2
                }
                stroke="var(--sigint-dim, #8aa)"
                strokeOpacity={0.6}
              />
              {showLabel && (
                <text
                  x={tx}
                  y={IntensityChartGeometry.Height - 3}
                  textAnchor="middle"
                  fontSize={6}
                  fill="var(--sigint-dim, #8aa)"
                  fontFamily="monospace"
                >
                  {s.fcstHour}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex justify-between text-(length:--sig-text-xs) font-mono text-sig-text mt-0.5">
        <span>now · {formatKtShort(firstW)}</span>
        <span>+{maxH}h · {formatKtShort(lastW)}</span>
      </div>
    </div>
  );
}
