import type { CSSProperties } from "react";
import { ktToMph } from "@/measurements";
import {
  cardinalCompassPointForDegrees,
  compassPointForDegrees,
} from "@shared/domain/compass";
import { AngleConversion, TurnDeg } from "@shared/geo";
import { EMPTY_TEXT } from "@shared/text";
import { windRadiiBandColor } from "../classification";
import { DossierTextClass } from "@/dossier";
import { chartPercent, CYCLONE_CHART_HEIGHT_CLASS } from "./CycloneIntensityCurve";
import {
  Category,
  CYCLONE_CATEGORY_METADATA,
  CYCLONE_STRONG_WIND_RADIUS_KT,
  type WindRadii,
} from "@shared/domain/cyclones";

enum WindRoseGeometry {
  ViewBox = 150,
  CenterDivisor = 2,
  RingInset = 16,
  LabelOffset = 9,
  PetalScale = 0.92,
  MiddleRingScale = 0.6,
  InnerRingScale = 0.3,
  CenterMarkerRadius = 3,
}

enum WindRoseBearing {
  North = 0,
  East = 90,
  South = 180,
  West = 270,
}

enum WindRoseStyle {
  WedgeFillOpacity = 0.18,
  WedgeStrokeOpacity = 0.95,
  WedgeStrokeWidth = 1.75,
}

const WIND_ROSE_PATH_DECIMALS = 1;

const WIND_ROSE_ZERO = 0;
const WIND_ROSE_SEPARATOR = " · ";

enum WindRoseSwatchGeometry {
  Size = 10,
  Radius = 3,
}

const WIND_ROSE_BEARINGS = Object.values(WindRoseBearing).filter(
  (value): value is WindRoseBearing => typeof value === "number",
);

function windRoseCenter(): number {
  return WindRoseGeometry.ViewBox / WindRoseGeometry.CenterDivisor;
}

function windRoseRadius(): number {
  return windRoseCenter() - WindRoseGeometry.RingInset;
}

function windRoseLabelRadius(): number {
  return windRoseRadius() + WindRoseGeometry.LabelOffset;
}

function polarPoint(
  bearingDegrees: number,
  radius: number,
): readonly [number, number] {
  const angle = (
    bearingDegrees - TurnDeg.Quarter
  ) * AngleConversion.RadiansPerDegree;
  return [
    windRoseCenter() + Math.cos(angle) * radius,
    windRoseCenter() + Math.sin(angle) * radius,
  ];
}

function wedgePath(
  startDegrees: number,
  nauticalMiles: number,
  pixelsPerNauticalMile: number,
): string {
  if (nauticalMiles <= WIND_ROSE_ZERO) return EMPTY_TEXT;
  const radius = nauticalMiles * pixelsPerNauticalMile;
  const [startX, startY] = polarPoint(startDegrees, radius);
  const [endX, endY] = polarPoint(
    startDegrees + TurnDeg.Quarter,
    radius,
  );
  return `M${windRoseCenter()},${windRoseCenter()} L${startX.toFixed(WIND_ROSE_PATH_DECIMALS)},${startY.toFixed(WIND_ROSE_PATH_DECIMALS)} A${radius.toFixed(WIND_ROSE_PATH_DECIMALS)},${radius.toFixed(WIND_ROSE_PATH_DECIMALS)} 0 0 1 ${endX.toFixed(WIND_ROSE_PATH_DECIMALS)},${endY.toFixed(WIND_ROSE_PATH_DECIMALS)} Z`;
}

function CompassLabels() {
  return WIND_ROSE_BEARINGS.map((bearing) => {
    const [x, y] = polarPoint(bearing, windRoseLabelRadius());
    const label = cardinalCompassPointForDegrees(bearing);
    if (label === null) return null;
    return (
      <span
        key={bearing}
        className={`absolute left-(--x) top-(--y) -translate-x-1/2 -translate-y-1/2 leading-none font-mono ${DossierTextClass.Label}`}
        style={{ "--x": chartPercent(x, WindRoseGeometry.ViewBox), "--y": chartPercent(y, WindRoseGeometry.ViewBox) } as CSSProperties}
      >
        {label}
      </span>
    );
  });
}

function WindBandSwatch({ threshold }: { readonly threshold: number }) {
  return (
    <svg
      viewBox={`0 0 ${WindRoseSwatchGeometry.Size} ${WindRoseSwatchGeometry.Size}`}
      className="w-2.5 h-2.5 shrink-0"
      aria-hidden
    >
      <rect
        width={WindRoseSwatchGeometry.Size}
        height={WindRoseSwatchGeometry.Size}
        rx={WindRoseSwatchGeometry.Radius}
        fill={windRadiiBandColor(threshold)}
      />
    </svg>
  );
}

export function CycloneWindRose({ radii }: { readonly radii: WindRadii }) {
  const center = windRoseCenter();
  const radius = windRoseRadius();
  const bands: ReadonlyArray<readonly [number, number[] | null]> = [
    [CYCLONE_CATEGORY_METADATA[Category.Hurricane1].minimumWindKt, radii.kt64],
    [CYCLONE_STRONG_WIND_RADIUS_KT, radii.kt50],
    [CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt, radii.kt34],
  ];
  const present = bands.filter(
    (band): band is readonly [number, number[]] => band[1] != null,
  );
  if (present.length === WIND_ROSE_ZERO) return null;

  const maxNauticalMiles = Math.max(
    ...present.flatMap(([, quadrants]) => quadrants),
  );
  const pixelsPerNauticalMile = maxNauticalMiles > WIND_ROSE_ZERO
    ? (radius * WindRoseGeometry.PetalScale) /
      maxNauticalMiles
    : WIND_ROSE_ZERO;
  const quadrantLabels = WIND_ROSE_BEARINGS.map((bearing) =>
    compassPointForDegrees(bearing + TurnDeg.Quarter / 2)
  ).join(WIND_ROSE_SEPARATOR);

  return (
    <div className="h-full flex items-center">
      <div className="flex flex-wrap items-center justify-center gap-4 size-full">
        <div className="flex items-center justify-center">
        <div className={`relative aspect-square max-w-full ${CYCLONE_CHART_HEIGHT_CLASS}`}>
        <svg
          viewBox={`0 0 ${WindRoseGeometry.ViewBox} ${WindRoseGeometry.ViewBox}`}
          className="size-full"
          role="img"
          aria-label="Wind radii quadrant plot"
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            className="fill-none stroke-sig-border"
          />
          <circle
            cx={center}
            cy={center}
            r={radius * WindRoseGeometry.MiddleRingScale}
            className="fill-none stroke-sig-grid/50"
          />
          <circle
            cx={center}
            cy={center}
            r={radius * WindRoseGeometry.InnerRingScale}
            className="fill-none stroke-sig-grid/50"
          />
          <g>
            <line
              x1={center}
              y1={center - radius}
              x2={center}
              y2={center + radius}
              className="stroke-sig-grid/40"
            />
            <line
              x1={center - radius}
              y1={center}
              x2={center + radius}
              y2={center}
              className="stroke-sig-grid/40"
            />
            {present
              .slice()
              .reverse()
              .map(([threshold, quadrants]) =>
                WIND_ROSE_BEARINGS.map((start, index) => {
                  const path = wedgePath(
                    start,
                    quadrants[index] ?? WIND_ROSE_ZERO,
                    pixelsPerNauticalMile,
                  );
                  if (path === EMPTY_TEXT) return null;
                  return (
                    <path
                      key={`${threshold}-${index}`}
                      d={path}
                      fill={windRadiiBandColor(threshold)}
                      fillOpacity={WindRoseStyle.WedgeFillOpacity}
                      stroke={windRadiiBandColor(threshold)}
                      strokeOpacity={WindRoseStyle.WedgeStrokeOpacity}
                      strokeWidth={WindRoseStyle.WedgeStrokeWidth}
                      strokeLinejoin="round"
                    />
                  );
                }),
              )}
          </g>
          <circle
            cx={center}
            cy={center}
            r={WindRoseGeometry.CenterMarkerRadius}
            className="fill-sig-bright"
          />
        </svg>
          <CompassLabels />
        </div>
        </div>
        <div className="shrink-0 max-w-full space-y-2 whitespace-nowrap">
          {present.map(([threshold, quadrants]) => (
            <div key={threshold} className="min-w-0">
              <div className={`flex items-center gap-2 ${DossierTextClass.Value}`}>
                <WindBandSwatch threshold={threshold} />
                <span className="font-semibold">
                  {threshold}kt{" "}
                  <span className="text-sig-dim font-normal">
                    · {ktToMph(threshold)}mph
                  </span>
                </span>
              </div>
              <div className={`flex items-center gap-2 font-mono ${DossierTextClass.Body}`}>
                <span className="w-2.5 shrink-0" aria-hidden />
                {quadrants.join(WIND_ROSE_SEPARATOR)}{" "}
                <span className="text-sig-dim">nm</span>
              </div>
            </div>
          ))}
          <div className={`flex items-center gap-2 ${DossierTextClass.Label}`}>
            <span className="w-2.5 shrink-0" aria-hidden />
            {quadrantLabels}
          </div>
        </div>
      </div>
    </div>
  );
}
