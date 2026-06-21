const VB_W = 48;
const VB_H = 200;
const CY = VB_H / 2;
const MAX = 2000;
const SPAN = 74;

const TICKS = [-2, -1, 0, 1, 2];

type Props = {
  readonly fpm: number;
};

type Tone = { readonly stroke: string; readonly fill: string; readonly text: string };

function tone(fpm: number): Tone {
  if (fpm < -MAX) return { stroke: "stroke-sig-danger", fill: "fill-sig-danger", text: "text-sig-danger" };
  if (fpm > 50) return { stroke: "stroke-sig-quakes", fill: "fill-sig-quakes", text: "text-sig-quakes" };
  if (fpm < -50) return { stroke: "stroke-sig-accent", fill: "fill-sig-accent", text: "text-sig-accent" };
  return { stroke: "stroke-sig-dim", fill: "fill-sig-dim", text: "text-sig-dim" };
}

export function VerticalSpeed({ fpm }: Props) {
  const clamped = Math.max(-MAX, Math.min(MAX, fpm));
  const y = CY - (clamped / MAX) * SPAN;
  const t = tone(fpm);

  return (
    <div className="relative h-full w-full bg-sig-bg rounded-[10px] border border-sig-border overflow-hidden">
      <div className="absolute top-1 inset-x-0 text-center text-(length:--sig-text-xs) tracking-widest text-sig-dim">
        VS
      </div>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        role="img"
        aria-label={`Vertical speed ${fpm} feet per minute`}
      >
        <line x1={6} y1={CY} x2={VB_W - 6} y2={CY} className="stroke-sig-dim" strokeOpacity={0.5} />
        {TICKS.map((v) => {
          const ty = CY - (v / 2) * SPAN;
          return (
            <g key={v}>
              <line x1={6} y1={ty} x2={v === 0 ? 16 : 12} y2={ty} className="stroke-sig-dim" strokeWidth={1} />
              {v !== 0 && (
                <text x={19} y={ty + 3} className="fill-sig-dim font-mono" fontSize={9}>
                  {Math.abs(v)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={6} y1={CY} x2={VB_W - 8} y2={y} className={t.stroke} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={6} cy={CY} r={3} className={t.fill} />
      </svg>
      <div className={`absolute bottom-1 inset-x-0 text-center text-(length:--sig-text-xs) font-mono ${t.text}`}>
        {fpm > 0 ? "+" : ""}
        {fpm}
      </div>
    </div>
  );
}
