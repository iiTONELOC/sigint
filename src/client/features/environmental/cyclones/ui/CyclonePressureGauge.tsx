import { useId } from "react";
import { CanvasLineStyle } from "@/lib/geo/render/types";
import { TurnDeg } from "@shared/geo";

enum PressureGauge {
  CenterX = 32,
  CenterY = 30,
  MaximumHectopascal = 1100,
  MinimumHectopascal = 800,
  NeedleInset = 3,
  Radius = 24,
}

function polarPoint(degrees: number, radius: number): readonly [number, number] {
  const radians = (degrees * Math.PI) / TurnDeg.Half;
  return [
    PressureGauge.CenterX + Math.cos(radians) * radius,
    PressureGauge.CenterY - Math.sin(radians) * radius,
  ];
}

function arcPath(fromDegrees: number, toDegrees: number): string {
  const [startX, startY] = polarPoint(fromDegrees, PressureGauge.Radius);
  const [endX, endY] = polarPoint(toDegrees, PressureGauge.Radius);
  const largeArc = Math.abs(toDegrees - fromDegrees) > TurnDeg.Half ? 1 : 0;
  const sweep = toDegrees < fromDegrees ? 1 : 0;
  return `M${startX.toFixed(2)},${startY.toFixed(2)} A${PressureGauge.Radius},${PressureGauge.Radius} 0 ${largeArc} ${sweep} ${endX.toFixed(2)},${endY.toFixed(2)}`;
}

function needleDegrees(pressureHpa: number): number {
  const pressure = Math.min(
    PressureGauge.MaximumHectopascal,
    Math.max(PressureGauge.MinimumHectopascal, pressureHpa),
  );
  const fraction =
    (pressure - PressureGauge.MinimumHectopascal) /
    (PressureGauge.MaximumHectopascal - PressureGauge.MinimumHectopascal);
  return TurnDeg.Half - fraction * TurnDeg.Half;
}

export function CyclonePressureGauge({ pressureHpa }: Readonly<{ pressureHpa: number }>) {
  const degrees = needleDegrees(pressureHpa);
  const [needleX, needleY] = polarPoint(
    degrees,
    PressureGauge.Radius - PressureGauge.NeedleInset,
  );
  const titleId = useId();

  return (
    <svg
      viewBox="0 0 64 40"
      className="h-9 w-16 shrink-0 text-(--dossier-accent)"
      aria-labelledby={titleId}
    >
      <title id={titleId}>Pressure {Math.round(pressureHpa)} hectopascal</title>
      <g
        className="fill-none stroke-current"
        strokeWidth={3}
        strokeLinecap={CanvasLineStyle.Round}
      >
        <path
          d={arcPath(TurnDeg.Half, 0)}
          strokeOpacity={0.25}
        />
        <path
          d={arcPath(TurnDeg.Half, degrees)}
          strokeOpacity={0.9}
        />
        <line
          x1={PressureGauge.CenterX}
          y1={PressureGauge.CenterY}
          x2={needleX.toFixed(2)}
          y2={needleY.toFixed(2)}
          strokeWidth={1.5}
        />
      </g>
      <circle cx={PressureGauge.CenterX} cy={PressureGauge.CenterY} r={2} className="fill-current" />
    </svg>
  );
}
