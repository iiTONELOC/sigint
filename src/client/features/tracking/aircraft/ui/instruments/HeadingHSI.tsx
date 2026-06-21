const C = 100;
const R = 86;

type Props = {
  readonly heading: number;
  /** flight-director selected heading (nav_heading), if transmitted. */
  readonly selectedHeading?: number;
};

const MARKS = Array.from({ length: 36 }, (_, i) => i * 10);

function cardinal(d: number): string {
  if (d === 0) return "N";
  if (d === 90) return "E";
  if (d === 180) return "S";
  if (d === 270) return "W";
  return String(d / 10);
}

export function HeadingHSI({ heading, selectedHeading }: Props) {
  const card = ((Math.round(heading) % 360) + 360) % 360;

  return (
    <div className="h-full w-full bg-sig-bg rounded-[10px] border border-sig-border p-1.5">
      <svg
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        role="img"
        aria-label={`Heading ${card} degrees`}
      >
        <circle cx={C} cy={C} r={R + 5} className="fill-none stroke-sig-dim" strokeOpacity={0.5} />

        {/* rotating compass card */}
        <g transform={`rotate(${-card} ${C} ${C})`}>
          {MARKS.map((d) => {
            const major = d % 30 === 0;
            const a = ((d - 90) * Math.PI) / 180;
            const r2 = R - (major ? 14 : 7);
            return (
              <g key={d}>
                <line
                  x1={C + Math.cos(a) * R}
                  y1={C + Math.sin(a) * R}
                  x2={C + Math.cos(a) * r2}
                  y2={C + Math.sin(a) * r2}
                  className="stroke-sig-dim"
                  strokeWidth={major ? 1.5 : 1}
                />
                {major && (
                  <text
                    x={C + Math.cos(a) * (R - 26)}
                    y={C + Math.sin(a) * (R - 26) + 4}
                    textAnchor="middle"
                    className="fill-sig-bright font-mono"
                    fontSize={d % 90 === 0 ? 13 : 10}
                  >
                    {cardinal(d)}
                  </text>
                )}
              </g>
            );
          })}

          {/* flight-director selected-heading bug (rotates with the card) */}
          {selectedHeading != null && (
            <g transform={`rotate(${selectedHeading} ${C} ${C})`}>
              <path
                d={`M${C - 6},${C - R - 1} L${C + 6},${C - R - 1} L${C + 6},${C - R + 7} L${C},${C - R + 3} L${C - 6},${C - R + 7} Z`}
                className="fill-sig-accent"
              />
            </g>
          )}
        </g>

        {/* fixed lubber line */}
        <path d={`M${C - 7},6 L${C + 7},6 L${C},19 Z`} className="fill-sig-bright" />

        {/* fixed aircraft symbol */}
        <g className="stroke-sig-bright" strokeWidth={2.5} fill="none" strokeLinecap="round">
          <line x1={C} y1={C - 20} x2={C} y2={C + 22} />
          <line x1={C - 16} y1={C} x2={C + 16} y2={C} />
          <line x1={C - 8} y1={C + 15} x2={C + 8} y2={C + 15} />
        </g>

        {/* digital heading box */}
        <rect x={C - 22} y={C + R - 16} width={44} height={18} rx={2} className="fill-sig-bg stroke-sig-dim" />
        <text
          x={C}
          y={C + R - 2}
          textAnchor="middle"
          className="fill-sig-bright font-mono"
          fontSize={13}
          fontWeight={700}
        >
          {`${String(card).padStart(3, "0")}°`}
        </text>
      </svg>
    </div>
  );
}
