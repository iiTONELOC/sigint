import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AngleConversion, TurnDeg } from "@shared/geo";
import { formatKtShort } from "@/measurements";
import { RenderMediaQuery } from "@/render-surface/reducedMotion";

export enum DialGeometry {
  Size = 200,
  Center = 100,
  BezelRadius = 96,
  ScaleRadius = 86,
  MajorTickLength = 12,
  MinorTickLength = 6,
  LabelRadius = 64,
  LabelFontSize = 15,
  TitleFontSize = 11,
  ReadoutFontSize = 13,
  TitleOffset = 34,
  ReadoutOffset = 30,
  ReadoutHalfWidth = 52,
  ReadoutHeight = 20,
  NeedleWidth = 3,
  HubRadius = 7,
}

export enum DialClassName {
  Bezel = "fill-sig-bg stroke-sig-border",
  Tick = "stroke-sig-text",
  Label = "fill-sig-bright font-mono",
  Title = "fill-sig-dim font-mono",
  Needle = "stroke-sig-bright",
  Hub = "fill-sig-bright",
  ReadoutBox = "fill-sig-panel stroke-sig-dim",
  Marker = "fill-sig-accent",
}

enum DialTextAnchor {
  Middle = "middle",
}

enum AirspeedScale {
  MaximumKnots = 600,
  StartDegrees = -150,
  SweepDegrees = 300,
  Divisions = 6,
  MinorPerMajor = 5,
}

enum AltimeterScale {
  FeetPerRevolution = 1_000,
  FeetPerShortHandRevolution = 10_000,
  Divisions = 10,
  MinorPerMajor = 5,
  LongHandRadius = 72,
  ShortHandRadius = 46,
  ShortHandWidth = 6,
  MarkerSize = 7,
}

enum VerticalSpeedScale {
  MaximumFeetPerMinute = 4_000,
  ZeroDegrees = -90,
  HalfSweepDegrees = 160,
  Divisions = 8,
  MinorPerMajor = 2,
  FeetPerLabel = 1_000,
}

enum AttitudeGeometry {
  WingHalfSpan = 40,
  WingGap = 12,
  WingDrop = 6,
  PointerHalfWidth = 6,
  PointerHeight = 10,
  SymbolStrokeWidth = 4,
}

enum FlightPathGeometry {
  UnitsPerDegree = 4,
  MaximumDegrees = 15,
  MarkerRadius = 6,
  MarkerWing = 11,
  MarkerTail = 7,
  MarkerStrokeWidth = 2.5,
  LadderStepDegrees = 5,
  LadderHalfWidth = 18,
  LadderWideHalfWidth = 30,
}

enum InstrumentTitle {
  Airspeed = "KT ×100",
  Altitude = "FT",
  Attitude = "ATT",
  VerticalSpeed = "VS ×1000",
}

enum InstrumentText {
  NoData = "NO DATA",
  Left = "L",
  Right = "R",
}

const ROUND_LINE_CAP = "round";
const EASE_DURATION_MS = 900;
const EASE_OUT_POWER = 3;

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.(RenderMediaQuery.ReducedMotion).matches ?? false;
}

export function useEasedValue(target: number, period?: number): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  useEffect(() => {
    const from = valueRef.current;
    const raw = target - from;
    const delta = period === undefined ? raw : raw - period * Math.round(raw / period);
    if (delta === 0 || prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      valueRef.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / EASE_DURATION_MS);
      const next = from + delta * (1 - (1 - progress) ** EASE_OUT_POWER);
      valueRef.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, period]);
  return value;
}

const PITCH_LADDER_DEGREES: readonly number[] = [-10, -5, 5, 10];

const BANK_MARKS: readonly number[] = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];

type Point = Readonly<{ x: number; y: number }>;

export function polar(angleDegrees: number, radius: number): Point {
  const radians = angleDegrees * AngleConversion.RadiansPerDegree;
  return {
    x: DialGeometry.Center + radius * Math.sin(radians),
    y: DialGeometry.Center - radius * Math.cos(radians),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function DialFrame({ title, label, children }: Readonly<{ title: string; label: string; children: ReactNode }>) {
  const titleId = useId();
  return (
    <svg viewBox={`0 0 ${DialGeometry.Size} ${DialGeometry.Size}`} className="block w-full h-auto" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{title}</title>
      <circle cx={DialGeometry.Center} cy={DialGeometry.Center} r={DialGeometry.BezelRadius} className={DialClassName.Bezel} />
      {children}
      <text
        x={DialGeometry.Center}
        y={DialGeometry.Center - DialGeometry.TitleOffset}
        textAnchor={DialTextAnchor.Middle}
        fontSize={DialGeometry.TitleFontSize}
        className={DialClassName.Title}
      >
        {label}
      </text>
    </svg>
  );
}

type DialTicksProps = Readonly<{
  start: number;
  sweep: number;
  divisions: number;
  minorPerMajor: number;
  labels: readonly string[];
  closed?: boolean;
}>;

export function DialTicks({ start, sweep, divisions, minorPerMajor, labels, closed = false }: DialTicksProps) {
  const steps = divisions * minorPerMajor;
  const count = closed ? steps : steps + 1;
  return (
    <g>
      {Array.from({ length: count }, (_, index) => {
        const angle = start + (sweep * index) / steps;
        const major = index % minorPerMajor === 0;
        const outer = polar(angle, DialGeometry.ScaleRadius);
        const inner = polar(angle, DialGeometry.ScaleRadius - (major ? DialGeometry.MajorTickLength : DialGeometry.MinorTickLength));
        const label = major ? labels[index / minorPerMajor] : undefined;
        const at = polar(angle, DialGeometry.LabelRadius);
        return (
          <g key={index}>
            <line x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} className={DialClassName.Tick} strokeWidth={major ? 2 : 1} />
            {label !== undefined && (
              <text x={at.x} y={at.y + DialGeometry.LabelFontSize / 3} textAnchor={DialTextAnchor.Middle} fontSize={DialGeometry.LabelFontSize} className={DialClassName.Label}>
                {label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export function Needle({ angle, radius, width = DialGeometry.NeedleWidth }: Readonly<{ angle: number; radius: number; width?: number }>) {
  const tip = polar(angle, radius);
  return (
    <line x1={DialGeometry.Center} y1={DialGeometry.Center} x2={tip.x} y2={tip.y} className={DialClassName.Needle} strokeWidth={width} strokeLinecap={ROUND_LINE_CAP} />
  );
}

function Hub() {
  return <circle cx={DialGeometry.Center} cy={DialGeometry.Center} r={DialGeometry.HubRadius} className={DialClassName.Hub} />;
}

export function Readout({ text }: Readonly<{ text: string }>) {
  const y = DialGeometry.Center + DialGeometry.ReadoutOffset;
  return (
    <g>
      <rect
        x={DialGeometry.Center - DialGeometry.ReadoutHalfWidth}
        y={y - DialGeometry.ReadoutHeight / 2}
        width={DialGeometry.ReadoutHalfWidth * 2}
        height={DialGeometry.ReadoutHeight}
        rx={4}
        className={DialClassName.ReadoutBox}
      />
      <text x={DialGeometry.Center} y={y + DialGeometry.ReadoutFontSize / 3} textAnchor={DialTextAnchor.Middle} fontSize={DialGeometry.ReadoutFontSize} className={DialClassName.Label}>
        {text}
      </text>
    </g>
  );
}

function scaleLabels(count: number, label: (index: number) => string): string[] {
  return Array.from({ length: count }, (_, index) => label(index));
}

export function AirspeedIndicator({ knots }: Readonly<{ knots: number }>) {
  const shown = useEasedValue(knots);
  const angle = AirspeedScale.StartDegrees +
    (clamp(shown, 0, AirspeedScale.MaximumKnots) / AirspeedScale.MaximumKnots) * AirspeedScale.SweepDegrees;
  return (
    <DialFrame title={`Airspeed ${Math.round(knots)} knots`} label={InstrumentTitle.Airspeed}>
      <DialTicks
        start={AirspeedScale.StartDegrees}
        sweep={AirspeedScale.SweepDegrees}
        divisions={AirspeedScale.Divisions}
        minorPerMajor={AirspeedScale.MinorPerMajor}
        labels={scaleLabels(AirspeedScale.Divisions + 1, String)}
      />
      <Needle angle={angle} radius={DialGeometry.ScaleRadius - DialGeometry.MinorTickLength} />
      <Readout text={formatKtShort(Math.round(knots))} />
      <Hub />
    </DialFrame>
  );
}

function AltitudeMarker({ feet }: Readonly<{ feet: number }>) {
  const angle = ((feet % AltimeterScale.FeetPerRevolution) / AltimeterScale.FeetPerRevolution) * TurnDeg.Full;
  const tip = polar(angle, DialGeometry.ScaleRadius);
  const left = polar(angle - AltimeterScale.MarkerSize, DialGeometry.BezelRadius);
  const right = polar(angle + AltimeterScale.MarkerSize, DialGeometry.BezelRadius);
  return <path d={`M${tip.x},${tip.y} L${left.x},${left.y} L${right.x},${right.y} Z`} className={DialClassName.Marker} />;
}

export function Altimeter({ feet, selectedFeet }: Readonly<{ feet: number; selectedFeet: number | undefined }>) {
  const shown = useEasedValue(feet);
  const longAngle = ((shown % AltimeterScale.FeetPerRevolution) / AltimeterScale.FeetPerRevolution) * TurnDeg.Full;
  const shortAngle = ((shown % AltimeterScale.FeetPerShortHandRevolution) / AltimeterScale.FeetPerShortHandRevolution) * TurnDeg.Full;
  return (
    <DialFrame title={`Altitude ${Math.round(feet)} feet`} label={InstrumentTitle.Altitude}>
      <DialTicks
        start={0}
        sweep={TurnDeg.Full}
        divisions={AltimeterScale.Divisions}
        minorPerMajor={AltimeterScale.MinorPerMajor}
        labels={scaleLabels(AltimeterScale.Divisions, String)}
        closed
      />
      {selectedFeet !== undefined && <AltitudeMarker feet={selectedFeet} />}
      <Needle angle={shortAngle} radius={AltimeterScale.ShortHandRadius} width={AltimeterScale.ShortHandWidth} />
      <Needle angle={longAngle} radius={AltimeterScale.LongHandRadius} />
      <Readout text={Math.round(feet).toLocaleString()} />
      <Hub />
    </DialFrame>
  );
}

export function VerticalSpeedIndicator({ feetPerMinute }: Readonly<{ feetPerMinute: number }>) {
  const limit = VerticalSpeedScale.MaximumFeetPerMinute;
  const half = VerticalSpeedScale.HalfSweepDegrees;
  const shown = useEasedValue(feetPerMinute);
  const angle = VerticalSpeedScale.ZeroDegrees + (clamp(shown, -limit, limit) / limit) * half;
  const labelCount = VerticalSpeedScale.Divisions + 1;
  const peak = VerticalSpeedScale.Divisions / 2;
  return (
    <DialFrame title={`Vertical speed ${feetPerMinute} feet per minute`} label={InstrumentTitle.VerticalSpeed}>
      <DialTicks
        start={VerticalSpeedScale.ZeroDegrees - half}
        sweep={half * 2}
        divisions={VerticalSpeedScale.Divisions}
        minorPerMajor={VerticalSpeedScale.MinorPerMajor}
        labels={scaleLabels(labelCount, (index) => String(Math.abs(peak - index)))}
      />
      <Needle angle={angle} radius={DialGeometry.ScaleRadius - DialGeometry.MinorTickLength} />
      <Readout text={`${feetPerMinute > 0 ? "+" : ""}${feetPerMinute.toLocaleString()}`} />
      <Hub />
    </DialFrame>
  );
}

function bankText(bankDegrees: number | undefined): string {
  if (bankDegrees === undefined) return InstrumentText.NoData;
  const rounded = Math.round(bankDegrees);
  if (rounded === 0) return "0°";
  return `${Math.abs(rounded)}° ${rounded > 0 ? InstrumentText.Right : InstrumentText.Left}`;
}

function BankScale() {
  return (
    <g>
      {BANK_MARKS.map((mark) => {
        const outer = polar(mark, DialGeometry.ScaleRadius);
        const inner = polar(mark, DialGeometry.ScaleRadius - (mark % 30 === 0 ? DialGeometry.MajorTickLength : DialGeometry.MinorTickLength));
        return <line key={mark} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} className={DialClassName.Tick} strokeWidth={2} />;
      })}
    </g>
  );
}

function AttitudeSymbol() {
  const { Center } = DialGeometry;
  const { WingHalfSpan, WingGap, WingDrop } = AttitudeGeometry;
  return (
    <g className="stroke-sig-aircraft fill-none" strokeWidth={AttitudeGeometry.SymbolStrokeWidth} strokeLinecap={ROUND_LINE_CAP}>
      <path d={`M${Center - WingHalfSpan},${Center} H${Center - WingGap} L${Center - WingGap / 2},${Center + WingDrop}`} />
      <path d={`M${Center + WingHalfSpan},${Center} H${Center + WingGap} L${Center + WingGap / 2},${Center + WingDrop}`} />
    </g>
  );
}

function PitchLadder() {
  const { Center } = DialGeometry;
  return (
    <g className={DialClassName.Needle} strokeWidth={1}>
      {PITCH_LADDER_DEGREES.map((degrees) => {
        const y = Center - degrees * FlightPathGeometry.UnitsPerDegree;
        const half = Math.abs(degrees) % (FlightPathGeometry.LadderStepDegrees * 2) === 0
          ? FlightPathGeometry.LadderWideHalfWidth
          : FlightPathGeometry.LadderHalfWidth;
        return <line key={degrees} x1={Center - half} y1={y} x2={Center + half} y2={y} />;
      })}
    </g>
  );
}

function FlightPathMarker({ degrees }: Readonly<{ degrees: number }>) {
  const { Center } = DialGeometry;
  const { MarkerRadius, MarkerWing, MarkerTail } = FlightPathGeometry;
  const y = Center - clamp(degrees, -FlightPathGeometry.MaximumDegrees, FlightPathGeometry.MaximumDegrees) * FlightPathGeometry.UnitsPerDegree;
  return (
    <g className="stroke-sig-accent fill-none" strokeWidth={FlightPathGeometry.MarkerStrokeWidth}>
      <circle cx={Center} cy={y} r={MarkerRadius} />
      <line x1={Center - MarkerRadius - MarkerWing} y1={y} x2={Center - MarkerRadius} y2={y} />
      <line x1={Center + MarkerRadius} y1={y} x2={Center + MarkerRadius + MarkerWing} y2={y} />
      <line x1={Center} y1={y - MarkerRadius} x2={Center} y2={y - MarkerRadius - MarkerTail} />
    </g>
  );
}

type AttitudeProps = Readonly<{ bankDegrees: number | undefined; flightPathDegrees: number | null }>;

export function AttitudeIndicator({ bankDegrees, flightPathDegrees }: AttitudeProps) {
  const clipId = useId();
  const shownBank = useEasedValue(bankDegrees ?? 0);
  const shownPath = useEasedValue(flightPathDegrees ?? 0);
  const { Center, Size, ScaleRadius } = DialGeometry;
  const pointerTop = Center - ScaleRadius + DialGeometry.MajorTickLength;
  return (
    <DialFrame title={`Bank ${bankText(bankDegrees)}`} label={InstrumentTitle.Attitude}>
      <defs>
        <clipPath id={clipId}><circle cx={Center} cy={Center} r={ScaleRadius} /></clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <g transform={`rotate(${-shownBank} ${Center} ${Center})`}>
          <rect x={0} y={0} width={Size} height={Center} className="fill-sig-accent/20" />
          <rect x={0} y={Center} width={Size} height={Center} className="fill-sig-recon/20" />
          <line x1={0} y1={Center} x2={Size} y2={Center} className={DialClassName.Needle} strokeWidth={2} />
          <PitchLadder />
          {flightPathDegrees !== null && <FlightPathMarker degrees={shownPath} />}
          <path
            d={`M${Center},${pointerTop} l-${AttitudeGeometry.PointerHalfWidth},${AttitudeGeometry.PointerHeight} h${AttitudeGeometry.PointerHalfWidth * 2} Z`}
            className={DialClassName.Marker}
          />
        </g>
      </g>
      <BankScale />
      <AttitudeSymbol />
      <Readout text={bankText(bankDegrees)} />
    </DialFrame>
  );
}
