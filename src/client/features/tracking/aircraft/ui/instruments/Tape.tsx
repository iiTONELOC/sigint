const VB_W = 64;
const VB_H = 220;
const CY = VB_H / 2;

type Props = {
  readonly value: number;
  /** kt or ft between adjacent ticks. */
  readonly step: number;
  /** label drawn every N units. */
  readonly labelEvery: number;
  /** px per unit — sets how fast the ladder scrolls. */
  readonly pxPer: number;
  /** which edge the value box points toward. */
  readonly side: "left" | "right";
  /** header label (KT / FT) and footer (e.g. mph, x1000). */
  readonly header: string;
  readonly footer?: string;
  /** flight-director selected value (e.g. nav_altitude_mcp) — draws a cyan bug. */
  readonly selected?: number;
  readonly format: (v: number) => string;
};

export function Tape({
  value,
  step,
  labelEvery,
  pxPer,
  side,
  header,
  footer,
  selected,
  format,
}: Props) {
  const base = Math.round(value / step) * step;
  const ticks: number[] = [];
  for (let i = -6; i <= 6; i++) {
    const v = base + i * step;
    if (v >= 0) ticks.push(v);
  }
  const yOf = (v: number) => CY + (value - v) * pxPer;

  const bx = side === "left" ? 2 : 6;
  const bw = VB_W - 8;
  const chevron =
    side === "left"
      ? `M${bx},${CY - 13} L${bx + bw - 8},${CY - 13} L${bx + bw},${CY} L${bx + bw - 8},${CY + 13} L${bx},${CY + 13} Z`
      : `M${bx + bw},${CY - 13} L${bx + 8},${CY - 13} L${bx},${CY} L${bx + 8},${CY + 13} L${bx + bw},${CY + 13} Z`;

  const selY = selected != null ? yOf(selected) : null;

  return (
    <div className="relative h-full w-full bg-sig-bg rounded-[10px] border border-sig-border overflow-hidden">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        role="img"
        aria-label={`${header} ${format(value)}`}
      >
        {ticks.map((v) => {
          const y = yOf(v);
          if (y < 30 || y > VB_H - 34) return null;
          const major = v % labelEvery === 0;
          const len = major ? 16 : 11;
          const x1 = side === "left" ? 0 : VB_W;
          const x2 = side === "left" ? len : VB_W - len;
          return (
            <g key={v}>
              <line x1={x1} y1={y} x2={x2} y2={y} className="stroke-sig-dim" strokeWidth={1} />
              {major && (
                <text
                  x={side === "left" ? 20 : VB_W - 20}
                  y={y + 3.5}
                  textAnchor={side === "left" ? "start" : "end"}
                  className="fill-sig-bright font-mono"
                  fontSize={11}
                >
                  {format(v)}
                </text>
              )}
            </g>
          );
        })}

        {selY != null && selY > 6 && selY < VB_H - 6 && (
          <rect
            x={side === "left" ? 0 : VB_W - 5}
            y={selY - 6}
            width={5}
            height={12}
            className="fill-sig-accent"
          />
        )}

        <path d={chevron} className="fill-sig-bg stroke-sig-bright" strokeWidth={1.5} />
        <text
          x={VB_W / 2}
          y={CY + 4}
          textAnchor="middle"
          className="fill-sig-bright font-mono"
          fontSize={14}
          fontWeight={700}
        >
          {format(value)}
        </text>
      </svg>

      {/* fades top/bottom so the ladder dissolves into the cell */}
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
