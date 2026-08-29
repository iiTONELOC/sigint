import { CompassPoint } from "@shared/domain/compass";
import { TurnDeg } from "@shared/geo";

type CardinalCompassPoint = CompassPoint.North | CompassPoint.East |
  CompassPoint.South | CompassPoint.West;

const GEOMETRY = Object.freeze({
  arrow: { angle: 4, inset: 12 },
  cardinal: { baselineOffset: 4, fontSize: 13, inset: 26 },
  center: 160,
  heading: { inset: 8, invalid: 511, markerBottom: 16, markerTop: 6 },
  radius: 148,
  status: { baselineOffset: 4, cornerRadius: 2, fontSize: 12, fontWeight: 700, halfWidth: 34, height: 18 },
  tick: { interval: 10, majorInset: 12, majorInterval: 30, minorInset: 6 },
  vector: { baseLength: 30, maximumLength: 120, speedScale: 4 },
  vessel: { bowOffset: 13, halfWidth: 6, shoulderOffset: 4, sternOffset: 11 },
  viewSize: 320,
});

const STYLE = Object.freeze({
  accent: "var(--dossier-accent)",
  dash: { axis: "2 4", course: "5 4" },
  gridClassName: "stroke-sig-border",
  noFill: "none",
  strokeWidth: { axis: 0.6, course: 2, heading: 1.5, majorTick: 1.3, minorTick: 0.8, ring: 1, vessel: 1.6 },
  textAnchor: "middle",
  textClassName: "fill-sig-bright font-mono",
  vesselFill: "color-mix(in srgb, var(--dossier-accent) 20%, transparent)",
});

const RING_FRACTIONS: readonly number[] = [1, 0.66, 0.33];

const CARDINAL_BEARING: Readonly<Record<CardinalCompassPoint, number>> = {
  [CompassPoint.North]: 0,
  [CompassPoint.East]: TurnDeg.Quarter,
  [CompassPoint.South]: TurnDeg.Half,
  [CompassPoint.West]: TurnDeg.Half + TurnDeg.Quarter,
};

const TICK_BEARINGS = Array.from(
  { length: TurnDeg.Full / GEOMETRY.tick.interval },
  (_, index) => index * GEOMETRY.tick.interval,
);
const NO_VALUE_LABEL = "-";

function bearingPoint(degrees: number, radius: number): [number, number] {
  const angle = ((degrees - TurnDeg.Quarter) * Math.PI) / TurnDeg.Half;
  return [
    GEOMETRY.center + Math.cos(angle) * radius,
    GEOMETRY.center + Math.sin(angle) * radius,
  ];
}

type EcdisScopeProps = Readonly<{ cog?: number; heading?: number; sog?: number }>;

export function EcdisScope({ heading, cog, sog }: EcdisScopeProps) {
  const { center, radius } = GEOMETRY;
  const hasHeading = heading != null && heading !== GEOMETRY.heading.invalid;
  const hasCog = cog != null;
  const vectorLength = Math.min(
    GEOMETRY.vector.maximumLength,
    GEOMETRY.vector.baseLength + (sog ?? 0) * GEOMETRY.vector.speedScale,
  );
  const [headingX, headingY] = hasHeading
    ? bearingPoint(heading, radius - GEOMETRY.heading.inset)
    : [center, center];
  const [vectorX, vectorY] = hasCog
    ? bearingPoint(cog, vectorLength)
    : [center, center];
  const arrowRadius = vectorLength - GEOMETRY.arrow.inset;
  const [arrowLeft, arrowRight] = hasCog
    ? [
        bearingPoint(cog - GEOMETRY.arrow.angle, arrowRadius),
        bearingPoint(cog + GEOMETRY.arrow.angle, arrowRadius),
      ]
    : [[center, center], [center, center]];
  const headingLabel = hasHeading ? `HDG ${Math.round(heading)}` : `HDG ${NO_VALUE_LABEL}`;
  const courseLabel = hasCog ? `COG ${Math.round(cog)}` : `COG ${NO_VALUE_LABEL}`;

  return (
    <svg viewBox={`0 0 ${GEOMETRY.viewSize} ${GEOMETRY.viewSize}`}
      className="block mx-auto w-full max-w-75" role="img" aria-label="Navigation scope">
      {RING_FRACTIONS.map((fraction) => (
        <circle key={fraction} cx={center} cy={center} r={radius * fraction}
          fill={STYLE.noFill} className={STYLE.gridClassName} strokeWidth={STYLE.strokeWidth.ring} />
      ))}
      <circle cx={center} cy={center} r={radius} fill={STYLE.noFill}
        stroke={STYLE.accent} strokeOpacity="0.5" strokeWidth={STYLE.strokeWidth.heading} />
      <path d={`M${center},${center - radius} V${center + radius} M${center - radius},${center} H${center + radius}`}
        className={STYLE.gridClassName} fill={STYLE.noFill} strokeWidth={STYLE.strokeWidth.axis}
        strokeDasharray={STYLE.dash.axis} />

      {TICK_BEARINGS.map((bearing) => {
        const major = bearing % GEOMETRY.tick.majorInterval === 0;
        const [outerX, outerY] = bearingPoint(bearing, radius);
        const [innerX, innerY] = bearingPoint(
          bearing,
          radius - (major ? GEOMETRY.tick.majorInset : GEOMETRY.tick.minorInset),
        );
        return <line key={bearing} x1={outerX} y1={outerY} x2={innerX} y2={innerY} className="stroke-sig-dim"
          strokeWidth={major
            ? STYLE.strokeWidth.majorTick
            : STYLE.strokeWidth.minorTick} />;
      })}
      {Object.entries(CARDINAL_BEARING).map(([point, bearing]) => {
        const [x, y] = bearingPoint(bearing, radius - GEOMETRY.cardinal.inset);
        return <text key={point} x={x} y={y + GEOMETRY.cardinal.baselineOffset}
          textAnchor={STYLE.textAnchor} className={STYLE.textClassName}
          fontSize={GEOMETRY.cardinal.fontSize}>{point}</text>;
      })}

      {hasCog && <>
        <line x1={center} y1={center} x2={vectorX} y2={vectorY}
          stroke={STYLE.accent} strokeWidth={STYLE.strokeWidth.course} strokeDasharray={STYLE.dash.course} />
        <path d={`M${vectorX},${vectorY} L${arrowLeft[0]},${arrowLeft[1]} L${arrowRight[0]},${arrowRight[1]} Z`}
          fill={STYLE.accent} />
      </>}
      {hasHeading && <line x1={center} y1={center} x2={headingX} y2={headingY}
        className="stroke-sig-bright" strokeWidth={STYLE.strokeWidth.heading} />}

      <g transform={`rotate(${hasHeading ? heading : 0} ${center} ${center})`}>
        <path d={`M${center},${center - GEOMETRY.vessel.bowOffset} L${center + GEOMETRY.vessel.halfWidth},${center - GEOMETRY.vessel.shoulderOffset} L${center + GEOMETRY.vessel.halfWidth},${center + GEOMETRY.vessel.sternOffset} L${center - GEOMETRY.vessel.halfWidth},${center + GEOMETRY.vessel.sternOffset} L${center - GEOMETRY.vessel.halfWidth},${center - GEOMETRY.vessel.shoulderOffset} Z`}
          fill={STYLE.vesselFill} stroke={STYLE.accent} strokeWidth={STYLE.strokeWidth.vessel} />
      </g>

      <path d={`M${center - GEOMETRY.vessel.halfWidth},${GEOMETRY.heading.markerTop} L${center + GEOMETRY.vessel.halfWidth},${GEOMETRY.heading.markerTop} L${center},${GEOMETRY.heading.markerBottom} Z`}
        className="fill-sig-bright" />
      <rect x={center - GEOMETRY.status.halfWidth}
        y={center + radius - GEOMETRY.status.height}
        width={GEOMETRY.status.halfWidth * 2} height={GEOMETRY.status.height}
        rx={GEOMETRY.status.cornerRadius} className="fill-sig-bg stroke-sig-dim" />
      <text x={center} y={center + radius - GEOMETRY.status.baselineOffset}
        textAnchor={STYLE.textAnchor} className={STYLE.textClassName}
        fontSize={GEOMETRY.status.fontSize} fontWeight={GEOMETRY.status.fontWeight}>
        {headingLabel} · {courseLabel}
      </text>
    </svg>
  );
}
