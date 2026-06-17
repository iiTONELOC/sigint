// ── CycloneIntensityCurve ────────────────────────────────────────────
// Wind-vs-lead-time area chart + Rapid Intensification badge, built from the
// forecast track we already have (no new fetch). Saffir-Simpson category
// bands give the line height meaning at a glance; a gradient fill under the
// line reads as intensity. Theme-aware via var(--sigint-*) so it tracks
// light/dark. Rendered in both the cyclone dossier and the detail pane.

import { useId } from "react";
import { TrendingUp } from "lucide-react";
import { formatKtMph } from "@/lib/units";
import type { CycloneData } from "../types";
import {
  analyzeIntensity,
  peakForecastWindKt,
} from "../data/intensity";
import { SAFFIR_SIMPSON, TS_MIN_KT } from "../classification";

const W = 260;
const H = 84;
const PAD_X = 4;
const PAD_TOP = 6;
const PAD_BOTTOM = 4;

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
  const firstW = winds[0] ?? 0;
  const lastW = winds.at(-1) ?? 0;

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

  // RI uses the watch amber to read as a caution; otherwise cyclone red.
  const lineColor = ri.isRapid ? "var(--sigint-cycWatch)" : "var(--sigint-cyclones)";

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span
          className="text-[10px] font-mono tracking-widest"
          style={{ color: "var(--sigint-warn)" }}
        >
          INTENSITY
        </span>
        <span className="text-[10px] font-mono text-sig-text">
          peak {formatKtMph(peak)}
          {lastW < firstW ? " · weakening" : lastW > firstW ? " · strengthening" : " · steady"}
        </span>
      </div>

      {ri.isRapid && (
        <div
          className="flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded text-[11px] font-mono font-semibold tracking-wider border"
          style={{
            color: "var(--sigint-cycWatch)",
            borderColor: "var(--sigint-cycWatch)",
            background: "color-mix(in srgb, var(--sigint-cycWatch) 12%, transparent)",
          }}
        >
          <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
          RAPID INTENSIFICATION · +{formatKtMph(ri.maxGain24hKt)}/24h
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "5.25rem" }}
        role="img"
        aria-label={`Forecast intensity: peak ${peak} knots${
          ri.isRapid ? `, rapid intensification +${ri.maxGain24hKt} knots per 24 hours` : ""
        }`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Category bands + labels */}
        {SS_BANDS.map((b) =>
          b.kt <= Y_MAX ? (
            <g key={b.label}>
              <line
                x1={PAD_X}
                x2={W - PAD_X}
                y1={y(b.kt)}
                y2={y(b.kt)}
                stroke="var(--sigint-grid)"
                strokeOpacity={0.25}
                strokeDasharray="2 3"
              />
              <text
                x={W - PAD_X}
                y={y(b.kt) - 1.5}
                textAnchor="end"
                fontSize={6}
                fill="var(--sigint-dim)"
                fontFamily="monospace"
              >
                {b.label}
              </text>
            </g>
          ) : null,
        )}

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
          <circle key={s.fcstHour} cx={x(s.fcstHour)} cy={y(s.maxWindKt)} r={1.75} fill={lineColor} />
        ))}
      </svg>

      <div className="flex justify-between text-[10px] font-mono text-sig-text mt-0.5">
        <span>now · {formatKtMph(firstW)}</span>
        <span>+{maxH}h · {formatKtMph(lastW)}</span>
      </div>
    </div>
  );
}
