import { useId } from "react";
enum VerticalSpeedGeometry {
  BaselineX = 6,
  ClimbThresholdFpm = 50,
  IndicatorEndInset = 8,
  LabelX = 19,
  MajorTickEndX = 16,
  MaximumFpm = 2_000,
  MinorTickEndX = 12,
  ScaleSpan = 74,
  ViewBoxHeight = 200,
  ViewBoxWidth = 48,
}
const TICKS = [-2, -1, 0, 1, 2];
type Props = {
  readonly fpm: number;
};
type Tone = { readonly stroke: string; readonly fill: string; readonly text: string };
function tone(fpm: number): Tone {
  if (fpm < -VerticalSpeedGeometry.MaximumFpm) return { stroke: "stroke-sig-danger", fill: "fill-sig-danger", text: "text-sig-danger" };
  if (fpm > VerticalSpeedGeometry.ClimbThresholdFpm) return { stroke: "stroke-sig-quakes", fill: "fill-sig-quakes", text: "text-sig-quakes" };
  if (fpm < -VerticalSpeedGeometry.ClimbThresholdFpm) return { stroke: "stroke-sig-accent", fill: "fill-sig-accent", text: "text-sig-accent" };
  return { stroke: "stroke-sig-dim", fill: "fill-sig-dim", text: "text-sig-dim" };
}
export function VerticalSpeed({ fpm }: Props) {
  const titleId = useId();
  const viewBoxCenter = VerticalSpeedGeometry.ViewBoxHeight / 2;
  const maximumTick = Math.max(...TICKS);
  const clamped = Math.max(-VerticalSpeedGeometry.MaximumFpm, Math.min(VerticalSpeedGeometry.MaximumFpm, fpm));
  const indicatorY = viewBoxCenter - (clamped / VerticalSpeedGeometry.MaximumFpm) * VerticalSpeedGeometry.ScaleSpan;
  const currentTone = tone(fpm);
  const neutralTone = tone(0);

  return (
    <div className="relative h-full w-full bg-sig-bg rounded-[10px] border border-sig-border overflow-hidden">
      <div className="absolute top-1 inset-x-0 text-center text-(length:--sig-text-xs) tracking-widest text-sig-dim">
        VS
      </div>
      <svg
        viewBox={`0 0 ${VerticalSpeedGeometry.ViewBoxWidth} ${VerticalSpeedGeometry.ViewBoxHeight}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{`Vertical speed ${fpm} feet per minute`}</title>
        <line x1={VerticalSpeedGeometry.BaselineX} y1={viewBoxCenter} x2={VerticalSpeedGeometry.ViewBoxWidth - VerticalSpeedGeometry.BaselineX} y2={viewBoxCenter} className={neutralTone.stroke} strokeOpacity={0.5} />
        {TICKS.map((tick) => {
          const tickY = viewBoxCenter - (tick / maximumTick) * VerticalSpeedGeometry.ScaleSpan;
          return (
            <g key={tick}>
              <line x1={VerticalSpeedGeometry.BaselineX} y1={tickY} x2={tick === 0 ? VerticalSpeedGeometry.MajorTickEndX : VerticalSpeedGeometry.MinorTickEndX} y2={tickY} className={neutralTone.stroke} strokeWidth={1} />
              {tick !== 0 && (
                <text x={VerticalSpeedGeometry.LabelX} y={tickY + 3} className="fill-sig-dim font-mono" fontSize={9}>
                  {Math.abs(tick)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={VerticalSpeedGeometry.BaselineX} y1={viewBoxCenter} x2={VerticalSpeedGeometry.ViewBoxWidth - VerticalSpeedGeometry.IndicatorEndInset} y2={indicatorY} className={currentTone.stroke} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={VerticalSpeedGeometry.BaselineX} cy={viewBoxCenter} r={3} className={currentTone.fill} />
      </svg>
      <div className={`absolute bottom-1 inset-x-0 text-center text-(length:--sig-text-xs) font-mono ${currentTone.text}`}>
        {fpm > 0 ? "+" : ""}
        {fpm}
      </div>
    </div>
  );
}
