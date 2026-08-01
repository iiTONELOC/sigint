import { AngleConversion, TurnDeg } from "@shared/geo";
import { cardinalCompassPointForDegrees } from "@shared/domain/compass";

enum HeadingScaleGeometry {
  Center = 100,
  Radius = 86,
  OuterRadiusOffset = 5,
  LabelInset = 26,
  LabelBaselineOffset = 4,
}

enum HeadingMarkGeometry {
  Count = 36,
  StepDegrees = 10,
  MajorIntervalDegrees = 30,
  MajorTickLength = 14,
  MinorTickLength = 7,
  MajorStrokeWidth = 1.5,
  MinorStrokeWidth = 1,
}

enum HeadingTextGeometry {
  CardinalIntervalDegrees = 90,
  CardinalFontSize = 13,
  OrdinalFontSize = 10,
  DigitalFontWeight = 700,
  DigitalBaselineOffset = 2,
  PadLength = 3,
}

enum SelectedHeadingGeometry {
  HalfWidth = 6,
  TopOffset = 1,
  BottomOffset = 7,
  NotchOffset = 3,
}

enum LubberGeometry {
  HalfWidth = 7,
  Top = 6,
  Bottom = 19,
}

enum AircraftSymbolGeometry {
  StrokeWidth = 2.5,
  NoseLength = 20,
  TailLength = 22,
  WingHalfSpan = 16,
  StabilizerHalfSpan = 8,
  StabilizerOffset = 15,
}

enum DigitalHeadingGeometry {
  HalfWidth = 22,
  VerticalOffset = 16,
  Height = 18,
  Radius = 2,
}

enum HeadingOpacity {
  OuterRing = 0.5,
}

enum HeadingHsiClassName {
  ReadoutText = "fill-sig-bright font-mono",
}

enum HeadingHsiTextAnchor {
  Middle = "middle",
}

type Props = {
  readonly heading: number;
  /** flight-director selected heading (nav_heading), if transmitted. */
  readonly selectedHeading?: number;
};

const HEADING_MARKS = Array.from(
  { length: HeadingMarkGeometry.Count },
  (_, index) => index * HeadingMarkGeometry.StepDegrees,
);

function cardinal(d: number): string {
  return cardinalCompassPointForDegrees(d) ??
    String(d / HeadingMarkGeometry.StepDegrees);
}

export function HeadingHSI({ heading, selectedHeading }: Props) {
  const card = (
    (Math.round(heading) % TurnDeg.Full) + TurnDeg.Full
  ) % TurnDeg.Full;
  const center = HeadingScaleGeometry.Center;
  const radius = HeadingScaleGeometry.Radius;

  return (
    <div className="h-full w-full bg-sig-bg rounded-[10px] border border-sig-border p-1.5">
      <svg
        viewBox={`0 0 ${center * 2} ${center * 2}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        aria-label={`Heading ${card} degrees`}
      >
        <circle
          cx={center}
          cy={center}
          r={radius + HeadingScaleGeometry.OuterRadiusOffset}
          className="fill-none stroke-sig-dim"
          strokeOpacity={HeadingOpacity.OuterRing}
        />

        <g transform={`rotate(${-card} ${center} ${center})`}>
          {HEADING_MARKS.map((degrees) => {
            const major = degrees % HeadingMarkGeometry.MajorIntervalDegrees === 0;
            const angle = (
              degrees - TurnDeg.Quarter
            ) * AngleConversion.RadiansPerDegree;
            const tickRadius = radius - (
              major
                ? HeadingMarkGeometry.MajorTickLength
                : HeadingMarkGeometry.MinorTickLength
            );
            return (
              <g key={degrees}>
                <line
                  x1={center + Math.cos(angle) * radius}
                  y1={center + Math.sin(angle) * radius}
                  x2={center + Math.cos(angle) * tickRadius}
                  y2={center + Math.sin(angle) * tickRadius}
                  className="stroke-sig-dim"
                  strokeWidth={
                    major
                      ? HeadingMarkGeometry.MajorStrokeWidth
                      : HeadingMarkGeometry.MinorStrokeWidth
                  }
                />
                {major && (
                  <text
                    x={center + Math.cos(angle) * (
                      radius - HeadingScaleGeometry.LabelInset
                    )}
                    y={center + Math.sin(angle) * (
                      radius - HeadingScaleGeometry.LabelInset
                    ) + HeadingScaleGeometry.LabelBaselineOffset}
                    textAnchor={HeadingHsiTextAnchor.Middle}
                    className={HeadingHsiClassName.ReadoutText}
                    fontSize={
                      degrees % HeadingTextGeometry.CardinalIntervalDegrees === 0
                        ? HeadingTextGeometry.CardinalFontSize
                        : HeadingTextGeometry.OrdinalFontSize
                    }
                  >
                    {cardinal(degrees)}
                  </text>
                )}
              </g>
            );
          })}

          {selectedHeading != null && (
            <g transform={`rotate(${selectedHeading} ${center} ${center})`}>
              <path
                d={`M${center - SelectedHeadingGeometry.HalfWidth},${center - radius - SelectedHeadingGeometry.TopOffset} L${center + SelectedHeadingGeometry.HalfWidth},${center - radius - SelectedHeadingGeometry.TopOffset} L${center + SelectedHeadingGeometry.HalfWidth},${center - radius + SelectedHeadingGeometry.BottomOffset} L${center},${center - radius + SelectedHeadingGeometry.NotchOffset} L${center - SelectedHeadingGeometry.HalfWidth},${center - radius + SelectedHeadingGeometry.BottomOffset} Z`}
                className="fill-sig-accent"
              />
            </g>
          )}
        </g>

        <path
          d={`M${center - LubberGeometry.HalfWidth},${LubberGeometry.Top} L${center + LubberGeometry.HalfWidth},${LubberGeometry.Top} L${center},${LubberGeometry.Bottom} Z`}
          className="fill-sig-bright"
        />

        <g
          className="stroke-sig-bright"
          strokeWidth={AircraftSymbolGeometry.StrokeWidth}
          fill="none"
          strokeLinecap="round"
        >
          <line
            x1={center}
            y1={center - AircraftSymbolGeometry.NoseLength}
            x2={center}
            y2={center + AircraftSymbolGeometry.TailLength}
          />
          <line
            x1={center - AircraftSymbolGeometry.WingHalfSpan}
            y1={center}
            x2={center + AircraftSymbolGeometry.WingHalfSpan}
            y2={center}
          />
          <line
            x1={center - AircraftSymbolGeometry.StabilizerHalfSpan}
            y1={center + AircraftSymbolGeometry.StabilizerOffset}
            x2={center + AircraftSymbolGeometry.StabilizerHalfSpan}
            y2={center + AircraftSymbolGeometry.StabilizerOffset}
          />
        </g>

        <rect
          x={center - DigitalHeadingGeometry.HalfWidth}
          y={center + radius - DigitalHeadingGeometry.VerticalOffset}
          width={DigitalHeadingGeometry.HalfWidth * 2}
          height={DigitalHeadingGeometry.Height}
          rx={DigitalHeadingGeometry.Radius}
          className="fill-sig-bg stroke-sig-dim"
        />
        <text
          x={center}
          y={center + radius - HeadingTextGeometry.DigitalBaselineOffset}
          textAnchor={HeadingHsiTextAnchor.Middle}
          className={HeadingHsiClassName.ReadoutText}
          fontSize={HeadingTextGeometry.CardinalFontSize}
          fontWeight={HeadingTextGeometry.DigitalFontWeight}
        >
          {`${String(card).padStart(HeadingTextGeometry.PadLength, "0")}°`}
        </text>
      </svg>
    </div>
  );
}
