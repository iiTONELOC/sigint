import { formatKmMi } from "@/measurements";
import {
  isShallow,
  MmiCssColor,
  mmiBand,
} from "../intensity";

enum DepthProfileGeometry {
  ViewBoxWidth = 320,
  ViewBoxHeight = 188,
  CenterX = 160,
  CenterY = 176,
  SurfaceRadius = 150,
  MaximumDepthKilometers = 700,
  CrustKilometers = 35,
  MohoKilometers = 70,
  MantleKilometers = 300,
  CrossArm = 6,
  LabelOffsetX = 8,
  SurfaceLabelOffsetY = 2,
}

enum DepthProfileStroke {
  BoundaryWidth = 1.5,
  LayerWidth = 1,
  EpicenterWidth = 2.4,
}

enum DepthProfileOpacity {
  Layer = 0.3,
  Guide = 0.5,
  FocusOutline = 0.35,
}

enum DepthProfileColor {
  Outline = "#000000",
  NoFill = "none",
}

function depthToRadius(kilometers: number): number {
  const boundedDepth = Math.min(
    DepthProfileGeometry.MaximumDepthKilometers,
    Math.max(0, kilometers),
  );
  const scale = Math.log10(1 + boundedDepth) /
    Math.log10(1 + DepthProfileGeometry.MaximumDepthKilometers);
  return DepthProfileGeometry.SurfaceRadius * (1 - scale);
}

export function DepthProfile({
  depthKm,
  mmi,
}: {
  readonly depthKm: number;
  readonly mmi: number;
}) {
  const band = mmiBand(mmi);
  const shallow = isShallow(depthKm);
  const focusY = DepthProfileGeometry.CenterY - depthToRadius(depthKm);
  const surfaceTopY =
    DepthProfileGeometry.CenterY - DepthProfileGeometry.SurfaceRadius;
  const rootClass = `${band.className} w-full max-w-80 mx-auto`;

  return (
    <div className={rootClass}>
      <svg
        viewBox={`0 0 ${DepthProfileGeometry.ViewBoxWidth} ${DepthProfileGeometry.ViewBoxHeight}`}
        className="w-full"
        role="img"
        aria-label="Hypocenter depth, Earth cross-section"
      >
        <defs>
          <clipPath id="quake-dome">
            <path
              d={`M${DepthProfileGeometry.CenterX - DepthProfileGeometry.SurfaceRadius},${DepthProfileGeometry.CenterY} A${DepthProfileGeometry.SurfaceRadius} ${DepthProfileGeometry.SurfaceRadius} 0 0 1 ${DepthProfileGeometry.CenterX + DepthProfileGeometry.SurfaceRadius},${DepthProfileGeometry.CenterY} Z`}
            />
          </clipPath>
        </defs>
        <g clipPath="url(#quake-dome)">
          <circle
            cx={DepthProfileGeometry.CenterX}
            cy={DepthProfileGeometry.CenterY}
            r={DepthProfileGeometry.SurfaceRadius}
            fill="color-mix(in srgb, #caa06a 60%, var(--color-sig-panel))"
          />
          <circle
            cx={DepthProfileGeometry.CenterX}
            cy={DepthProfileGeometry.CenterY}
            r={depthToRadius(DepthProfileGeometry.CrustKilometers)}
            fill="color-mix(in srgb, #c47a3e 58%, var(--color-sig-panel))"
          />
          <circle
            cx={DepthProfileGeometry.CenterX}
            cy={DepthProfileGeometry.CenterY}
            r={depthToRadius(DepthProfileGeometry.MohoKilometers)}
            fill="color-mix(in srgb, #b5673c 58%, var(--color-sig-panel))"
          />
          <circle
            cx={DepthProfileGeometry.CenterX}
            cy={DepthProfileGeometry.CenterY}
            r={depthToRadius(DepthProfileGeometry.MantleKilometers)}
            fill="color-mix(in srgb, #8a4a28 60%, var(--color-sig-panel))"
          />
          <g
            fill={DepthProfileColor.NoFill}
            stroke={DepthProfileColor.Outline}
            strokeOpacity={DepthProfileOpacity.Layer}
            strokeWidth={DepthProfileStroke.LayerWidth}
          >
            <circle
              cx={DepthProfileGeometry.CenterX}
              cy={DepthProfileGeometry.CenterY}
              r={depthToRadius(DepthProfileGeometry.CrustKilometers)}
            />
            <circle
              cx={DepthProfileGeometry.CenterX}
              cy={DepthProfileGeometry.CenterY}
              r={depthToRadius(DepthProfileGeometry.MohoKilometers)}
            />
            <circle
              cx={DepthProfileGeometry.CenterX}
              cy={DepthProfileGeometry.CenterY}
              r={depthToRadius(DepthProfileGeometry.MantleKilometers)}
            />
          </g>
        </g>
        <path
          d={`M${DepthProfileGeometry.CenterX - DepthProfileGeometry.SurfaceRadius},${DepthProfileGeometry.CenterY} A${DepthProfileGeometry.SurfaceRadius} ${DepthProfileGeometry.SurfaceRadius} 0 0 1 ${DepthProfileGeometry.CenterX + DepthProfileGeometry.SurfaceRadius},${DepthProfileGeometry.CenterY}`}
          fill={DepthProfileColor.NoFill}
          className="stroke-sig-dim"
          strokeWidth={DepthProfileStroke.BoundaryWidth}
        />
        <line
          x1={DepthProfileGeometry.CenterX - DepthProfileGeometry.SurfaceRadius}
          y1={DepthProfileGeometry.CenterY}
          x2={DepthProfileGeometry.CenterX + DepthProfileGeometry.SurfaceRadius}
          y2={DepthProfileGeometry.CenterY}
          className="stroke-sig-border"
          strokeWidth={DepthProfileStroke.BoundaryWidth}
        />
        <line
          x1={DepthProfileGeometry.CenterX}
          y1={surfaceTopY + DepthProfileGeometry.LabelOffsetX}
          x2={DepthProfileGeometry.CenterX}
          y2={focusY}
          className="stroke-sig-bright"
          strokeOpacity={DepthProfileOpacity.Guide}
          strokeWidth={DepthProfileStroke.LayerWidth}
          strokeDasharray="2 3"
        />
        <g
          stroke={MmiCssColor.Intensity}
          strokeWidth={DepthProfileStroke.EpicenterWidth}
        >
          <line
            x1={DepthProfileGeometry.CenterX - DepthProfileGeometry.CrossArm}
            y1={surfaceTopY - DepthProfileGeometry.CrossArm}
            x2={DepthProfileGeometry.CenterX + DepthProfileGeometry.CrossArm}
            y2={surfaceTopY + DepthProfileGeometry.CrossArm}
          />
          <line
            x1={DepthProfileGeometry.CenterX + DepthProfileGeometry.CrossArm}
            y1={surfaceTopY - DepthProfileGeometry.CrossArm}
            x2={DepthProfileGeometry.CenterX - DepthProfileGeometry.CrossArm}
            y2={surfaceTopY + DepthProfileGeometry.CrossArm}
          />
        </g>
        <circle
          cx={DepthProfileGeometry.CenterX}
          cy={focusY}
          r={DepthProfileGeometry.CrossArm}
          fill={MmiCssColor.Intensity}
          stroke={DepthProfileColor.Outline}
          strokeOpacity={DepthProfileOpacity.FocusOutline}
        />
        <text
          x={DepthProfileGeometry.CenterX + DepthProfileGeometry.LabelOffsetX}
          y={surfaceTopY - DepthProfileGeometry.SurfaceLabelOffsetY}
          className="fill-sig-bright text-(length:--sig-text-xs) font-mono"
        >
          EPICENTER
        </text>
        <text
          x={DepthProfileGeometry.CenterX + DepthProfileGeometry.LabelOffsetX}
          y={focusY}
          dominantBaseline="middle"
          className="text-(length:--sig-text-xs) font-mono"
        >
          <tspan className="fill-sig-bright font-bold">
            {formatKmMi(depthKm)}
          </tspan>{" "}
          <tspan fill={MmiCssColor.Intensity}>
            · {shallow ? "SHALLOW" : "DEEP"}
          </tspan>
        </text>
      </svg>
    </div>
  );
}
