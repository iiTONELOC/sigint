import { formatPixelKm } from "../formatters";
import { kilometersToMeters } from "@/measurements";

enum DetectionFootprintGeometry {
  MaximumBoxPixels = 76,
  MinimumBoxPixels = 8,
  NominalKilometers = 0.375,
  PixelsPerKilometer = 90,
}

enum DetectionFootprintSwathBoundary {
  NearNadirMaximumKilometers = 0.45,
  MidScanMaximumKilometers = 0.62,
}

enum DetectionFootprintCorner {
  CornerRadius = 2,
}

enum DetectionFootprintStroke {
  StrokeWidth = 2,
}

type SwathVerdict = Readonly<{
  zone: string;
  note: string;
}>;

function boxSize(kilometers: number): number {
  return Math.min(
    DetectionFootprintGeometry.MaximumBoxPixels,
    Math.max(
      DetectionFootprintGeometry.MinimumBoxPixels,
      kilometers * DetectionFootprintGeometry.PixelsPerKilometer,
    ),
  );
}

function centeredOffset(size: number): number {
  return (DetectionFootprintGeometry.MaximumBoxPixels - size) / 2;
}

function swathVerdict(scan: number): SwathVerdict {
  if (
    scan <
    DetectionFootprintSwathBoundary.NearNadirMaximumKilometers
  ) {
    return { zone: "near-nadir", note: "sharp fix" };
  }
  if (
    scan < DetectionFootprintSwathBoundary.MidScanMaximumKilometers
  ) {
    return { zone: "mid-scan", note: "moderate" };
  }
  return { zone: "swath edge", note: "coarse localization" };
}

export function DetectionFootprint({
  scan,
  track,
}: {
  readonly scan: number;
  readonly track: number;
}) {
  const width = boxSize(scan);
  const height = boxSize(track);
  const reference =
    DetectionFootprintGeometry.NominalKilometers *
    DetectionFootprintGeometry.PixelsPerKilometer;
  const verdict = swathVerdict(scan);

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox={`0 0 ${DetectionFootprintGeometry.MaximumBoxPixels} ${DetectionFootprintGeometry.MaximumBoxPixels}`}
        className="size-19 shrink-0"
        role="img"
        aria-label="Detection footprint compared with the nominal pixel"
      >
        <rect
          x={centeredOffset(reference)}
          y={centeredOffset(reference)}
          width={reference}
          height={reference}
          rx={DetectionFootprintCorner.CornerRadius}
          fill="none"
          className="stroke-sig-dim/60"
          strokeDasharray="3 2"
        />
        <rect
          x={centeredOffset(width)}
          y={centeredOffset(height)}
          width={width}
          height={height}
          rx={DetectionFootprintCorner.CornerRadius}
          className="fill-(--dossier-accent)/15 stroke-(--dossier-accent)"
          strokeWidth={DetectionFootprintStroke.StrokeWidth}
        />
      </svg>
      <div className="min-w-0 flex flex-col gap-1">
        <div className="font-mono text-(length:--sig-text-md) text-sig-bright">
          {formatPixelKm(scan, track)}
        </div>
        <div className="text-(length:--sig-text-xs) text-sig-dim">
          dashed = nominal{" "}
          {kilometersToMeters(
            DetectionFootprintGeometry.NominalKilometers,
          )}{" "}
          m at nadir
        </div>
        <div className="text-(length:--sig-text-xs)">
          <span className="text-sig-bright tracking-wide">
            {verdict.zone}
          </span>
          <span className="text-sig-dim"> · {verdict.note}</span>
        </div>
      </div>
    </div>
  );
}
