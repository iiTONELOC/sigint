import { coordinatedBankDegrees } from "../../utils/isa";
import { DialClassName, DialFrame, DialGeometry, polar, useEasedValue } from "./FlightInstruments";

enum TurnScale {
  StandardRateDegreesPerSecond = 3,
  StandardRateMarkDegrees = 20,
  MaximumSymbolDegrees = 40,
  MarkLength = 14,
  MarkStrokeWidth = 4,
  LabelDrop = 30,
  LabelInset = 34,
  LabelFontSize = 13,
  LevelDegrees = 90,
}

enum TurnSymbolGeometry {
  WingHalfSpan = 52,
  FuselageRadius = 7,
  TailHeight = 12,
  StrokeWidth = 5,
}

enum SlipBallGeometry {
  TubeOffset = 46,
  TubeHalfWidth = 44,
  TubeHeight = 16,
  BallRadius = 6,
  MaximumSlipDegrees = 10,
  CenterGap = 1,
  NoteOffset = 22,
  NoteFontSize = 11,
}

enum TurnCoordinatorText {
  Title = "TURN",
  Left = "L",
  Right = "R",
  Estimated = "SLIP EST",
  NoData = "NO DATA",
}

enum TurnTextAnchor {
  Middle = "middle",
}

type Props = Readonly<{
  bankDegrees: number | undefined;
  turnRateDegreesPerSecond: number | undefined;
  airspeedKnots: number;
}>;

const RATE_MARK_ANGLES: readonly number[] = [
  -TurnScale.LevelDegrees - TurnScale.StandardRateMarkDegrees,
  -TurnScale.LevelDegrees,
  TurnScale.LevelDegrees,
  TurnScale.LevelDegrees + TurnScale.StandardRateMarkDegrees,
];

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

function symbolRotation(turnRate: number | undefined): number {
  if (turnRate === undefined) return 0;
  return clamp(
    (turnRate / TurnScale.StandardRateDegreesPerSecond) * TurnScale.StandardRateMarkDegrees,
    TurnScale.MaximumSymbolDegrees,
  );
}

function slipBallOffset({ bankDegrees, turnRateDegreesPerSecond, airspeedKnots }: Props): number {
  if (bankDegrees === undefined || turnRateDegreesPerSecond === undefined) return 0;
  const slip = bankDegrees - coordinatedBankDegrees(airspeedKnots, turnRateDegreesPerSecond);
  return (clamp(slip, SlipBallGeometry.MaximumSlipDegrees) / SlipBallGeometry.MaximumSlipDegrees) *
    (SlipBallGeometry.TubeHalfWidth - SlipBallGeometry.BallRadius);
}

function RateMarks() {
  return (
    <g className={DialClassName.Needle} strokeWidth={TurnScale.MarkStrokeWidth}>
      {RATE_MARK_ANGLES.map((angle) => {
        const outer = polar(angle, DialGeometry.ScaleRadius);
        const inner = polar(angle, DialGeometry.ScaleRadius - TurnScale.MarkLength);
        return <line key={angle} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} />;
      })}
    </g>
  );
}

function AircraftSymbol({ rotation }: Readonly<{ rotation: number }>) {
  const { Center } = DialGeometry;
  return (
    <g transform={`rotate(${rotation} ${Center} ${Center})`} className="stroke-sig-aircraft fill-sig-aircraft" strokeLinecap="round">
      <line x1={Center - TurnSymbolGeometry.WingHalfSpan} y1={Center} x2={Center + TurnSymbolGeometry.WingHalfSpan} y2={Center} strokeWidth={TurnSymbolGeometry.StrokeWidth} />
      <circle cx={Center} cy={Center} r={TurnSymbolGeometry.FuselageRadius} />
      <line x1={Center} y1={Center} x2={Center} y2={Center - TurnSymbolGeometry.TailHeight} strokeWidth={TurnSymbolGeometry.StrokeWidth} />
    </g>
  );
}

function SlipBall({ offset, note }: Readonly<{ offset: number; note: string }>) {
  const { Center } = DialGeometry;
  const { TubeHalfWidth, TubeHeight, BallRadius, CenterGap } = SlipBallGeometry;
  const tubeY = Center + SlipBallGeometry.TubeOffset;
  const top = tubeY - TubeHeight / 2;
  const bottom = tubeY + TubeHeight / 2;
  return (
    <g>
      <rect x={Center - TubeHalfWidth} y={top} width={TubeHalfWidth * 2} height={TubeHeight} rx={TubeHeight / 2} className={DialClassName.ReadoutBox} />
      <line x1={Center - BallRadius - CenterGap} y1={top} x2={Center - BallRadius - CenterGap} y2={bottom} className={DialClassName.Tick} />
      <line x1={Center + BallRadius + CenterGap} y1={top} x2={Center + BallRadius + CenterGap} y2={bottom} className={DialClassName.Tick} />
      <circle cx={Center + offset} cy={tubeY} r={BallRadius} className={DialClassName.Hub} />
      <text x={Center} y={tubeY + SlipBallGeometry.NoteOffset} textAnchor={TurnTextAnchor.Middle} fontSize={SlipBallGeometry.NoteFontSize} className={DialClassName.Title}>
        {note}
      </text>
    </g>
  );
}

export function TurnCoordinator(props: Props) {
  const { Center, ScaleRadius } = DialGeometry;
  const turnRate = props.turnRateDegreesPerSecond;
  const hasData = props.bankDegrees !== undefined && turnRate !== undefined;
  const labelY = Center + TurnScale.LabelDrop;
  const rotation = useEasedValue(symbolRotation(turnRate));
  const ballOffset = useEasedValue(slipBallOffset(props));
  return (
    <DialFrame
      title={hasData ? `Turn rate ${turnRate.toFixed(1)} degrees per second` : TurnCoordinatorText.NoData}
      label={TurnCoordinatorText.Title}
    >
      <RateMarks />
      <g className={DialClassName.Title} fontSize={TurnScale.LabelFontSize} textAnchor={TurnTextAnchor.Middle}>
        <text x={Center - ScaleRadius + TurnScale.LabelInset} y={labelY}>{TurnCoordinatorText.Left}</text>
        <text x={Center + ScaleRadius - TurnScale.LabelInset} y={labelY}>{TurnCoordinatorText.Right}</text>
      </g>
      <AircraftSymbol rotation={rotation} />
      <SlipBall offset={ballOffset} note={hasData ? TurnCoordinatorText.Estimated : TurnCoordinatorText.NoData} />
    </DialFrame>
  );
}
