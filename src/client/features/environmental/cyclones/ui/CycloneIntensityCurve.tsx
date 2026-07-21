// ── CycloneIntensityCurve ────────────────────────────────────────────
// Wind-vs-lead-time area chart + Rapid Intensification badge, built from the
// forecast track we already have (no new fetch). Saffir-Simpson category
// bands give the line height meaning at a glance; a gradient fill under the
// line reads as intensity. Theme-aware via var(--sigint-*) so it tracks
// light/dark. Rendered in both the cyclone dossier and the detail pane.

import { useId } from "react";
import { TrendingUp } from "lucide-react";
import { formatKtShort } from "@/lib/format/units";
import type { CycloneData } from "../types";
import {
  analyzeIntensity,
  peakForecastWindKt,
} from "../data/intensity";
import { SAFFIR_SIMPSON, TS_MIN_KT, windColor } from "../classification";

const W = 260;
const H = 90;
const PAD_X = 4;
const PAD_TOP = 6;
// Bottom gutter holds the forecast-hour axis labels below the plot, clear of
// the curve baseline.
const PAD_BOTTOM = 12;

// Saffir-Simpson lower bounds (kt). Bands shade the chart so a viewer reads
// the line's height as a category, not just a number.
const SS_BANDS = [
  ...SAFFIR_SIMPSON.map((b) => ({ label: b.label, kt: b.minKt })),
  { label: "TS", kt: TS_MIN_KT },
];

export function CycloneIntensityCurve({ storm }: { readonly storm: CycloneData }) {
  const gradientId = useId();
  const { series, ri } = analyzeIntensity(storm);

  if (series.length < 2) return null;

  const hours = series.map((s) => s.fcstHour);
  const winds = series.map((s) => s.maxWindKt);
  const minH = Math.min(...hours);
  const maxH = Math.max(...hours);
  const peak = peakForecastWindKt(series);
  const peakSample = series.reduce((highest, sample) =>
    sample.maxWindKt > highest.maxWindKt ? sample : highest,
  );
  const firstW = winds[0] ?? 0;
  const lastW = winds.at(-1) ?? 0;
  const peakTime =
    peakSample.fcstHour === 0 ? "now" : `+${peakSample.fcstHour}h`;

  // Fixed y-domain (0..150 kt) so the same wind sits at the same height across
  // storms and the category bands line up with real thresholds.
  const Y_MAX = 150;
  const spanH = maxH - minH || 1;
  const plotH = H - PAD_TOP - PAD_BOTTOM;

  const x = (h: number) => PAD_X + ((h - minH) / spanH) * (W - 2 * PAD_X);
  const y = (w: number) => PAD_TOP + (1 - Math.min(w, Y_MAX) / Y_MAX) * plotH;

  const line = series
    .map((s, i) => `${i === 0 ? "M" : "L"}${x(s.fcstHour).toFixed(1)},${y(s.maxWindKt).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(maxH).toFixed(1)},${(H - PAD_BOTTOM).toFixed(1)} L${x(minH).toFixed(1)},${(H - PAD_BOTTOM).toFixed(1)} Z`;

  // Line is the storm's CURRENT category color (now = firstW), not its peak —
  // a C4-now storm reads C4, even if it crested higher. The per-point dots and
  // the filled SS zone bands carry the changing category along the curve. Under
  // RI the line goes watch-amber as a caution.
  const lineColor = ri.isRapid ? "var(--sigint-cycWatch)" : windColor(firstW);

  // Y of a category's lower bound, for filling each Saffir-Simpson zone.
  const yKt = (kt: number) => y(Math.min(kt, Y_MAX));

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
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-28 @min-[28rem]/dossier:h-36"
        role="img"
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

        {/* Saffir-Simpson zones — each category band filled in its own color so
            the chart's vertical position reads as a category at a glance. */}
        {SS_BANDS.map((b, i) => {
          if (b.kt > Y_MAX) return null;
          const top = yKt(b.kt);
          const prevKt = SS_BANDS[i - 1]?.kt ?? Y_MAX;
          const bottom = yKt(Math.min(prevKt, Y_MAX));
          return (
            <g key={b.label}>
              <rect
                x={PAD_X}
                y={top}
                width={W - 2 * PAD_X}
                height={Math.max(0, bottom - top)}
                fill={windColor(b.kt)}
                fillOpacity={0.1}
              />
              <line
                x1={PAD_X}
                x2={W - PAD_X}
                y1={top}
                y2={top}
                stroke={windColor(b.kt)}
                strokeOpacity={0.3}
                strokeDasharray="2 3"
              />
              <text
                x={W - PAD_X}
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

        {/* "NOW" marker — vertical line at the current moment (fcstHour 0). */}
        {(() => {
          const nx = x(minH) + 1;
          return (
            <g>
              <line
                x1={nx}
                x2={nx}
                y1={PAD_TOP}
                y2={H - PAD_BOTTOM}
                stroke="var(--sigint-bright, #cdd9ec)"
                strokeOpacity={0.5}
                strokeDasharray="2 2"
              />
              <text
                x={nx + 2}
                y={PAD_TOP + 6}
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

        {/* Area + line */}
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

        {/* Forecast-hour axis: a tick under every forecast point, but labels
            thinned (every other when crowded) and placed in the bottom gutter
            so they never overlap the curve baseline. */}
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
                y1={H - PAD_BOTTOM}
                y2={H - PAD_BOTTOM + 2}
                stroke="var(--sigint-dim, #8aa)"
                strokeOpacity={0.6}
              />
              {showLabel && (
                <text
                  x={tx}
                  y={H - 3}
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
