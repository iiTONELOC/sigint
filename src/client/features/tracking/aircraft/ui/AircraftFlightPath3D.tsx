// ── AircraftFlightPath3D ─────────────────────────────────────────────
// Isometric 3D view of the aircraft's recent track over a ground grid —
// altitude is height, so climb/descent and turns read at a glance. Pure SVG,
// props-driven (mirrors CycloneForecastMiniMap): every point is pre-projected to
// iso space, then the whole scene (floor + path) is fit to the box. Globe
// untouched — this is its own little 3D scene drawn in 2D.

import type { TrailPoint } from "@/lib/trailService";
import { formatKtMph } from "@/lib/units";

const W = 264;
const H = 168;
const PAD = 12;
const HUD_H = 16;
const NM_PER_DEG = 60;
const FT_PER_NM = 6076;
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;
const ALT_EXAG = 3; // altitude is tiny next to ground track — lift it to read
const GRID = 4;

type R = { rx: number; ry: number };

// 3D (east-nm, north-nm, alt-ft) → iso 2D. Farther + higher ⇒ further up screen.
function proj3(e: number, n: number, u: number): R {
  const depth = (e + n) * SIN30;
  const ix = (e - n) * COS30;
  const uz = (u / FT_PER_NM) * ALT_EXAG;
  return { rx: ix, ry: -depth - uz };
}

export function AircraftFlightPath3D({
  trail,
  heading,
  altitude,
  speed,
  speedMps,
  verticalRate,
  onGround,
}: {
  readonly trail: TrailPoint[];
  readonly heading?: number;
  readonly altitude?: number;
  readonly speed?: number;
  readonly speedMps?: number;
  readonly verticalRate?: number;
  readonly onGround?: boolean;
}) {
  if (trail.length < 2) return null;

  const first = trail[0]!;
  const cos0 = Math.max(0.2, Math.cos((first.lat * Math.PI) / 180));
  const local = trail.map((p) => ({
    e: (p.lon - first.lon) * cos0 * NM_PER_DEG,
    n: (p.lat - first.lat) * NM_PER_DEG,
    u: p.altitude ?? 0,
  }));

  let eMin = Infinity,
    eMax = -Infinity,
    nMin = Infinity,
    nMax = -Infinity;
  for (const { e, n } of local) {
    eMin = Math.min(eMin, e);
    eMax = Math.max(eMax, e);
    nMin = Math.min(nMin, n);
    nMax = Math.max(nMax, n);
  }
  // Floor extent: pad the track bounds, with a minimum so a short track still
  // sits on a visible patch of ground rather than a sliver.
  const ePad = Math.max((eMax - eMin) * 0.35, 4);
  const nPad = Math.max((nMax - nMin) * 0.35, 4);
  const fE0 = eMin - ePad,
    fE1 = eMax + ePad,
    fN0 = nMin - nPad,
    fN1 = nMax + nPad;

  const floor = [
    proj3(fE0, fN0, 0),
    proj3(fE1, fN0, 0),
    proj3(fE1, fN1, 0),
    proj3(fE0, fN1, 0),
  ];
  const grid: [R, R][] = [];
  for (let i = 0; i <= GRID; i++) {
    const e = fE0 + (fE1 - fE0) * (i / GRID);
    grid.push([proj3(e, fN0, 0), proj3(e, fN1, 0)]);
    const n = fN0 + (fN1 - fN0) * (i / GRID);
    grid.push([proj3(fE0, n, 0), proj3(fE1, n, 0)]);
  }
  const top = local.map(({ e, n, u }) => proj3(e, n, u));
  const shadow = local.map(({ e, n }) => proj3(e, n, 0));

  // Fit the whole scene (floor + path) to the box, preserving the iso angles.
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const r of [...floor, ...top, ...shadow]) {
    minX = Math.min(minX, r.rx);
    maxX = Math.max(maxX, r.rx);
    minY = Math.min(minY, r.ry);
    maxY = Math.max(maxY, r.ry);
  }
  const spanX = Math.max(maxX - minX, 1e-3);
  const spanY = Math.max(maxY - minY, 1e-3);
  const innerW = W - 2 * PAD;
  const innerH = H - 2 * PAD - HUD_H;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const offX = PAD + (innerW - spanX * scale) / 2;
  const offY = PAD + (innerH - spanY * scale) / 2;
  const sx = (rx: number) => offX + (rx - minX) * scale;
  const sy = (ry: number) => offY + (ry - minY) * scale;

  const pathD = (pts: R[]) =>
    pts
      .map((r, i) => `${i === 0 ? "M" : "L"}${sx(r.rx).toFixed(1)},${sy(r.ry).toFixed(1)}`)
      .join(" ");

  const step = Math.max(1, Math.floor(top.length / 6));
  const drops = top
    .map((r, i) => ({ r, g: shadow[i]!, i }))
    .filter(({ i }) => i % step === 0 || i === top.length - 1);

  const head = top[top.length - 1]!;
  const prev = top[top.length - 2]!;
  const dirX = sx(head.rx) - sx(prev.rx);
  const dirY = sy(head.ry) - sy(prev.ry);
  const headAng = (Math.atan2(dirY, dirX) * 180) / Math.PI;

  const ac = "var(--sigint-aircraft, #f5c451)";
  const dim = "var(--sigint-dim, #6b7a8d)";

  const altText = onGround
    ? "GND"
    : altitude
      ? `FL${Math.round(altitude / 100)}`
      : "—";
  const gsText =
    typeof speedMps === "number"
      ? formatKtMph(speed ?? 0)
      : `${Math.round(speed ?? 0)} kt`;
  const vs = typeof verticalRate === "number" ? Math.round(verticalRate * 196.85) : 0;
  const vsText = vs ? `${vs > 0 ? "▲" : "▼"}${Math.abs(vs)}` : "level";
  const hud = `${altText}  ·  ${gsText}  ·  ${vsText}  ·  ${Math.round(heading ?? 0)}°`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded border border-sig-border"
      style={{ height: "10.5rem", background: "var(--sigint-oceanDeep, #0a1420)" }}
      role="img"
      aria-label="3D flight path — altitude as height over a ground grid"
    >
      {/* Ground plane */}
      <polygon
        points={floor.map((r) => `${sx(r.rx).toFixed(1)},${sy(r.ry).toFixed(1)}`).join(" ")}
        fill={dim}
        fillOpacity={0.06}
      />
      {grid.map(([a, b], i) => (
        <line
          key={i}
          x1={sx(a.rx)}
          y1={sy(a.ry)}
          x2={sx(b.rx)}
          y2={sy(b.ry)}
          stroke={dim}
          strokeOpacity={0.22}
          strokeWidth={0.5}
        />
      ))}

      {/* Ground shadow of the track */}
      <path
        d={pathD(shadow)}
        fill="none"
        stroke={dim}
        strokeOpacity={0.5}
        strokeWidth={1}
        strokeDasharray="2 2"
        strokeLinecap="round"
      />

      {/* Vertical droplines — connect the track to its shadow */}
      {drops.map(({ r, g }, i) => (
        <line
          key={i}
          x1={sx(r.rx)}
          y1={sy(r.ry)}
          x2={sx(g.rx)}
          y2={sy(g.ry)}
          stroke={dim}
          strokeOpacity={0.3}
          strokeWidth={0.75}
        />
      ))}

      {/* The flown path */}
      <path
        d={pathD(top)}
        fill="none"
        stroke={ac}
        strokeWidth={1.5}
        strokeOpacity={0.45}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Start marker */}
      <circle
        cx={sx(top[0]!.rx)}
        cy={sy(top[0]!.ry)}
        r={2.5}
        fill="none"
        stroke={dim}
        strokeWidth={1}
      />

      {/* Aircraft at the head, pointed along travel */}
      <g transform={`translate(${sx(head.rx).toFixed(1)},${sy(head.ry).toFixed(1)}) rotate(${headAng.toFixed(1)})`}>
        <path d="M6,0 L-4,3.5 L-1.5,0 L-4,-3.5 Z" fill={ac} />
      </g>

      {/* Telemetry HUD */}
      <text
        x={W / 2}
        y={H - 5}
        textAnchor="middle"
        fontSize={9}
        fill="var(--sigint-text, #c8d4e0)"
        fontFamily="monospace"
      >
        {hud}
      </text>
    </svg>
  );
}
