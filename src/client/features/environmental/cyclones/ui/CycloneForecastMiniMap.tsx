// ── CycloneForecastMiniMap ───────────────────────────────────────────
// Small equirectangular map of the forecast track over a coastline backdrop —
// far more readable than a list of raw lat/lon. Uses the shared land polygons
// (landService) and an aspect-correct local projection. The globe renders land
// in its worker, so the main-thread copy may be empty here — fetch it on demand
// (cached after first load) and re-render when it arrives.

import { useEffect, useState } from "react";
import { getLand, enrichLand } from "@/lib/landService";
import type { ForecastPoint } from "../types";
import { windColor } from "../classification";

const W = 260;
const H = 150;
const PAD = 8;

type Pt = {
  lat: number;
  lon: number;
  fcstHour: number;
  maxWindKt: number;
  current?: boolean;
};

export function CycloneForecastMiniMap({
  current,
  forecast,
}: {
  readonly current: { lat: number; lon: number; maxWindKt: number };
  readonly forecast: ForecastPoint[];
}) {
  const [land, setLand] = useState<number[][][]>(() => getLand());
  useEffect(() => {
    if (land.length === 0) enrichLand((l) => setLand(l));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pts: Pt[] = [
    { ...current, fcstHour: 0, current: true },
    ...forecast.map((f) => ({
      lat: f.lat,
      lon: f.lon,
      fcstHour: f.fcstHour,
      maxWindKt: f.maxWindKt,
    })),
  ];
  if (pts.length < 2) return null;

  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  // Pad the bounds so the track isn't jammed against the edges.
  const padLat = Math.max(maxLat - minLat, 0.5) * 0.45;
  const padLon = Math.max(maxLon - minLon, 0.5) * 0.45;
  minLat -= padLat;
  maxLat += padLat;
  minLon -= padLon;
  maxLon += padLon;

  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  const geoW = (maxLon - minLon) * cosLat;
  const geoH = maxLat - minLat;
  const innerW = W - 2 * PAD;
  const innerH = H - 2 * PAD;
  const scale = Math.min(innerW / geoW, innerH / geoH);
  const offX = PAD + (innerW - geoW * scale) / 2;
  const offY = PAD + (innerH - geoH * scale) / 2;
  const px = (lon: number) => offX + (lon - minLon) * cosLat * scale;
  const py = (lat: number) => offY + (maxLat - lat) * scale;

  // Coastline polygons that touch the view box (stored as [lat, lon]).
  const landPaths: string[] = [];
  for (const poly of land) {
    let touches = false;
    for (const v of poly) {
      if (v[0]! >= minLat && v[0]! <= maxLat && v[1]! >= minLon && v[1]! <= maxLon) {
        touches = true;
        break;
      }
    }
    if (!touches) continue;
    let d = "";
    for (let i = 0; i < poly.length; i++) {
      d += `${i === 0 ? "M" : "L"}${px(poly[i]![1]!).toFixed(1)},${py(poly[i]![0]!).toFixed(1)}`;
    }
    landPaths.push(d + "Z");
  }

  const track = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.lon).toFixed(1)},${py(p.lat).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded border border-sig-border"
      style={{ height: "9.5rem", background: "var(--sigint-oceanDeep, #0a1420)" }}
      role="img"
      aria-label="Forecast track over coastline"
    >
      {landPaths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="var(--sigint-land, #1c2b3c)"
          fillOpacity={0.6}
          stroke="var(--sigint-grid, #2a3a4a)"
          strokeOpacity={0.4}
          strokeWidth={0.5}
        />
      ))}

      <path
        d={track}
        fill="none"
        stroke="var(--sigint-cyclones, #ff66cc)"
        strokeWidth={1.5}
        strokeDasharray="3 2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {pts.map((p) => (
        <g key={p.fcstHour}>
          <circle
            cx={px(p.lon)}
            cy={py(p.lat)}
            r={p.current ? 3.5 : 2.5}
            fill={windColor(p.maxWindKt)}
            stroke="#000"
            strokeWidth={0.5}
          />
          <text
            x={px(p.lon)}
            y={py(p.lat) - 4.5}
            textAnchor="middle"
            fontSize={6}
            fill="var(--sigint-dim, #8aa)"
            fontFamily="monospace"
          >
            {p.current ? "now" : `+${p.fcstHour}h`}
          </text>
        </g>
      ))}
    </svg>
  );
}
