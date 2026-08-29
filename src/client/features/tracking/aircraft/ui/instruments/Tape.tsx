import { useId } from "react";
import { PanelSide } from "@/layout-mode/model/layoutMode";

enum TapeGeometry {
  ChevronHalfHeight = 13,
  LabelInset = 20,
  MajorTickLength = 16,
  MaximumVisibleTickInset = 34,
  MinimumTickIndex = -6,
  MinimumVisibleTickY = 30,
  SelectedBugHalfHeight = 6,
  TickLengthDifference = 5,
  TickLabelFontSize = 11,
  ValueBoxInset = 8,
  ValueFontSize = 14,
  ValueFontWeight = 700,
  ViewBoxHeight = 220,
  ViewBoxWidth = 64,
}
type Props = {
  readonly value: number;
  readonly step: number;
  readonly labelEvery: number;
  readonly pxPer: number;
  readonly side: PanelSide;
  readonly header: string;
  readonly footer?: string;
  readonly selected?: number;
  readonly format: (value: number) => string;
};
export function Tape({ value, step, labelEvery, pxPer, side, header, footer, selected, format }: Props) {
  const titleId = useId();
  const viewBoxCenter = TapeGeometry.ViewBoxHeight / 2;
  const selectedBugWidth = TapeGeometry.SelectedBugHalfHeight - 1;
  const base = Math.round(value / step) * step;
  const ticks: number[] = [];
  for (let index = TapeGeometry.MinimumTickIndex; index <= -TapeGeometry.MinimumTickIndex; index += 1) {
    const tickValue = base + index * step;
    if (tickValue >= 0) ticks.push(tickValue);
  }
  const tickY = (tickValue: number) =>
    viewBoxCenter + (value - tickValue) * pxPer;
  const boxX = side === PanelSide.Left ? 2 : 6;
  const boxWidth = TapeGeometry.ViewBoxWidth - TapeGeometry.ValueBoxInset;
  const chevron =
    side === PanelSide.Left
      ? `M${boxX},${viewBoxCenter - TapeGeometry.ChevronHalfHeight} L${boxX + boxWidth - TapeGeometry.ValueBoxInset},${viewBoxCenter - TapeGeometry.ChevronHalfHeight} L${boxX + boxWidth},${viewBoxCenter} L${boxX + boxWidth - TapeGeometry.ValueBoxInset},${viewBoxCenter + TapeGeometry.ChevronHalfHeight} L${boxX},${viewBoxCenter + TapeGeometry.ChevronHalfHeight} Z`
      : `M${boxX + boxWidth},${viewBoxCenter - TapeGeometry.ChevronHalfHeight} L${boxX + TapeGeometry.ValueBoxInset},${viewBoxCenter - TapeGeometry.ChevronHalfHeight} L${boxX},${viewBoxCenter} L${boxX + TapeGeometry.ValueBoxInset},${viewBoxCenter + TapeGeometry.ChevronHalfHeight} L${boxX + boxWidth},${viewBoxCenter + TapeGeometry.ChevronHalfHeight} Z`;
  const selectedY = selected != null ? tickY(selected) : null;
  return (
    <div className="relative h-full w-full bg-sig-bg rounded-[10px] border border-sig-border overflow-hidden">
      <svg
        viewBox={`0 0 ${TapeGeometry.ViewBoxWidth} ${TapeGeometry.ViewBoxHeight}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full fill-sig-bright font-mono"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{`${header} ${format(value)}`}</title>
        {ticks.map((tickValue) => {
          const y = tickY(tickValue);
          if (y < TapeGeometry.MinimumVisibleTickY || y > TapeGeometry.ViewBoxHeight - TapeGeometry.MaximumVisibleTickInset) return null;
          const major = tickValue % labelEvery === 0;
          const tickLength = major ? TapeGeometry.MajorTickLength : TapeGeometry.MajorTickLength - TapeGeometry.TickLengthDifference;
          const tickStartX = side === PanelSide.Left ? 0 : TapeGeometry.ViewBoxWidth;
          const tickEndX = side === PanelSide.Left ? tickLength : TapeGeometry.ViewBoxWidth - tickLength;
          return (
            <g key={tickValue}>
              <line x1={tickStartX} y1={y} x2={tickEndX} y2={y} className="stroke-sig-dim" strokeWidth={1} />
              {major && (
                <text
                  x={side === PanelSide.Left ? TapeGeometry.LabelInset : TapeGeometry.ViewBoxWidth - TapeGeometry.LabelInset}
                  y={y + 3.5}
                  textAnchor={side === PanelSide.Left ? "start" : "end"}
                  fontSize={TapeGeometry.TickLabelFontSize}
                >
                  {format(tickValue)}
                </text>
              )}
            </g>
          );
        })}
        {selectedY != null && selectedY > TapeGeometry.SelectedBugHalfHeight && selectedY < TapeGeometry.ViewBoxHeight - TapeGeometry.SelectedBugHalfHeight && (
          <rect
            x={side === PanelSide.Left ? 0 : TapeGeometry.ViewBoxWidth - selectedBugWidth}
            y={selectedY - TapeGeometry.SelectedBugHalfHeight}
            width={selectedBugWidth}
            height={TapeGeometry.SelectedBugHalfHeight * 2}
            className="fill-sig-accent"
          />
        )}
        <path d={chevron} className="fill-sig-bg stroke-sig-bright" strokeWidth={1.5} />
        <text
          x={TapeGeometry.ViewBoxWidth / 2}
          y={viewBoxCenter + 4}
          textAnchor="middle"
          fontSize={TapeGeometry.ValueFontSize}
          fontWeight={TapeGeometry.ValueFontWeight}
        >
          {format(value)}
        </text>
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-9 bg-linear-to-b from-sig-bg to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-linear-to-t from-sig-bg to-transparent" />
      <div className="absolute top-1 inset-x-0 text-center text-(length:--sig-text-xs) tracking-widest text-sig-dim">
        {header}
      </div>
      {footer && (
        <div className="absolute bottom-1 inset-x-0 text-center text-(length:--sig-text-xs) text-sig-accent">
          {footer}
        </div>
      )}
    </div>
  );
}
