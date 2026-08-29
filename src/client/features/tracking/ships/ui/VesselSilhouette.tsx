import { shipDimensions, type ShipData } from "@shared/domain/ships";

enum VesselDimensionLabel {
  Beam = "BEAM",
  Draught = "DRAUGHT",
  Length = "LENGTH",
}

export function VesselSilhouette({ data }: { readonly data: ShipData }) {
  const { length = 0, beam = 0 } = shipDimensions(data);

  if (length <= 0 || beam <= 0) {
    return <div className="text-(length:--sig-text-xs) text-sig-dim">no dimensions reported</div>;
  }

  const half = 2;
  const bowTaperRatio = 0.18;
  const canvasHeight = 150;
  const minimumCanvasWidth = 22;
  const maximumCanvasWidth = 110;
  const viewBoxInset = 2;
  const hullStrokeRatio = 0.012;
  const antennaRadiusRatio = 0.035;
  const accent = "var(--dossier-accent)";
  const antennaX = data.dimC ?? beam / half;
  const antennaY = data.dimA ?? length / half;
  const bowTaper = Math.min(length * bowTaperRatio, beam);
  const canvasWidth = Math.max(
    minimumCanvasWidth,
    Math.min(maximumCanvasWidth, canvasHeight * (beam / length)),
  );
  const hullPath = `M ${beam / half} 0 L ${beam} ${bowTaper} L ${beam} ${length} L 0 ${length} L 0 ${bowTaper} Z`;
  const valueByDimension: Partial<Record<VesselDimensionLabel, string>> = {
    [VesselDimensionLabel.Length]: `${Math.round(length)} m`,
    [VesselDimensionLabel.Beam]: `${Math.round(beam)} m`,
  };
  if (data.draught !== undefined && data.draught > 0) {
    valueByDimension[VesselDimensionLabel.Draught] =
      `${data.draught.toFixed(1)} m`;
  }

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox={`${-viewBoxInset} ${-viewBoxInset} ${beam + viewBoxInset * half} ${length + viewBoxInset * half}`}
        width={canvasWidth}
        height={canvasHeight}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Vessel hull to scale"
        className="shrink-0"
      >
        <path d={hullPath} fill={accent} fillOpacity="0.14" stroke={accent}
          strokeWidth={Math.max(beam, length) * hullStrokeRatio} vectorEffect="non-scaling-stroke" />
        <circle cx={antennaX} cy={antennaY}
          r={Math.max(beam, length) * antennaRadiusRatio} fill={accent} />
      </svg>
      <div className="min-w-0 flex flex-col gap-1.5 font-mono text-(length:--sig-text-sm) text-sig-bright">
        {Object.entries(valueByDimension).map(([label, value]) => (
          <div key={label}>{value}{" "}
            <span className="text-sig-dim font-sans text-(length:--sig-text-xs)">{label}</span>
          </div>
        ))}
        <div className="text-(length:--sig-text-xs) text-sig-dim font-sans">● GPS antenna position</div>
      </div>
    </div>
  );
}
