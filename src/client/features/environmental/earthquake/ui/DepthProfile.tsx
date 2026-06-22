import { formatKmMi } from "@/lib/format/units";
import { mmiColor, isShallow } from "../intensity";

const VBW = 320;
const VBH = 188;
const CX = VBW / 2;
const CY = 176;
const R_SURFACE = 150;
const MAX_DEPTH_KM = 700;
const CRUST_KM = 35;
const MOHO_KM = 70;
const MANTLE_KM = 300;

function depthToRadius(km: number): number {
  const t = Math.log10(1 + Math.min(MAX_DEPTH_KM, Math.max(0, km))) / Math.log10(1 + MAX_DEPTH_KM);
  return R_SURFACE * (1 - t);
}

function pctX(x: number): string {
  return `${(x / VBW) * 100}%`;
}
function pctY(y: number): string {
  return `${(y / VBH) * 100}%`;
}

export function DepthProfile({
  depthKm,
  mmi,
}: {
  readonly depthKm: number;
  readonly mmi: number;
}) {
  const color = mmiColor(mmi);
  const shallow = isShallow(depthKm);
  const focusY = CY - depthToRadius(depthKm);
  const surfaceTopY = CY - R_SURFACE;

  return (
    <div className="relative w-full max-w-80 mx-auto">
      <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full" role="img" aria-label="Hypocenter depth — Earth cross-section">
        <defs>
          <clipPath id="quake-dome">
            <path d={`M${CX - R_SURFACE},${CY} A${R_SURFACE} ${R_SURFACE} 0 0 1 ${CX + R_SURFACE},${CY} Z`} />
          </clipPath>
        </defs>
        <g clipPath="url(#quake-dome)">
          <circle cx={CX} cy={CY} r={R_SURFACE} fill="color-mix(in srgb, #caa06a 60%, var(--color-sig-panel))" />
          <circle cx={CX} cy={CY} r={depthToRadius(CRUST_KM)} fill="color-mix(in srgb, #c47a3e 58%, var(--color-sig-panel))" />
          <circle cx={CX} cy={CY} r={depthToRadius(MOHO_KM)} fill="color-mix(in srgb, #b5673c 58%, var(--color-sig-panel))" />
          <circle cx={CX} cy={CY} r={depthToRadius(MANTLE_KM)} fill="color-mix(in srgb, #8a4a28 60%, var(--color-sig-panel))" />
          <g fill="none" stroke="#000000" strokeOpacity="0.3" strokeWidth="1">
            <circle cx={CX} cy={CY} r={depthToRadius(CRUST_KM)} />
            <circle cx={CX} cy={CY} r={depthToRadius(MOHO_KM)} />
            <circle cx={CX} cy={CY} r={depthToRadius(MANTLE_KM)} />
          </g>
        </g>
        <path
          d={`M${CX - R_SURFACE},${CY} A${R_SURFACE} ${R_SURFACE} 0 0 1 ${CX + R_SURFACE},${CY}`}
          fill="none"
          className="stroke-sig-dim"
          strokeWidth="1.5"
        />
        <line x1={CX - R_SURFACE} y1={CY} x2={CX + R_SURFACE} y2={CY} className="stroke-sig-border" strokeWidth="1.5" />
        <line x1={CX} y1={surfaceTopY + 8} x2={CX} y2={focusY} className="stroke-sig-bright" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 3" />
        <g style={{ stroke: color }} strokeWidth="2.4">
          <line x1={CX - 6} y1={surfaceTopY - 6} x2={CX + 6} y2={surfaceTopY + 6} />
          <line x1={CX + 6} y1={surfaceTopY - 6} x2={CX - 6} y2={surfaceTopY + 6} />
        </g>
        <circle cx={CX} cy={focusY} r="6" style={{ fill: color }} stroke="#000000" strokeOpacity="0.35" />
      </svg>

      <span
        className="absolute -translate-y-full pl-2 text-(length:--sig-text-xs) text-sig-bright font-mono whitespace-nowrap"
        style={{ left: pctX(CX + 8), top: pctY(surfaceTopY - 2) }}
      >
        EPICENTER
      </span>
      <span
        className="absolute -translate-y-1/2 pl-2 text-(length:--sig-text-xs) font-mono whitespace-nowrap"
        style={{ left: pctX(CX + 8), top: pctY(focusY) }}
      >
        <span className="text-sig-bright font-bold">{formatKmMi(depthKm)}</span>{" "}
        <span style={{ color }}>· {shallow ? "SHALLOW" : "DEEP"}</span>
      </span>
    </div>
  );
}
