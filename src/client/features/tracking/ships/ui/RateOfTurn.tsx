import { rotLabel } from "../shipMeta";

// Classic bridge rate-of-turn indicator: horizontal scale, port left / stbd
// right, needle off-centre = turning. Raw AIS ROT: -128 unavailable, 0 steady,
// sign = direction, ±127 = hard (>5°/30s ≈ off-scale).
const X0 = 30;
const X1 = 290;
const MID = (X0 + X1) / 2;
const HALF = (X1 - X0) / 2;
const MAX = 30; // °/min full-scale

export function RateOfTurn({ rot }: { readonly rot?: number }) {
  const label = rotLabel(rot);
  const has = label != null;
  const val = has && rot != null && rot !== 0 ? Math.max(-MAX, Math.min(MAX, rot)) : 0;
  const nx = MID + (val / MAX) * HALF;

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 320 50" className="flex-1 min-w-0" role="img" aria-label="Rate of turn">
        <line x1={X0} y1={30} x2={X1} y2={30} className="stroke-sig-border" strokeWidth="2" />
        {[-3, -2, -1, 0, 1, 2, 3].map((i) => {
          const x = MID + i * (HALF / 3);
          return (
            <g key={i}>
              <line x1={x} y1={24} x2={x} y2={36} className="stroke-sig-dim" strokeWidth={i === 0 ? 2 : 1} />
              <text x={x} y={14} textAnchor="middle" className="fill-sig-dim font-mono" fontSize={10}>{Math.abs(i * 10)}</text>
            </g>
          );
        })}
        <text x={8} y={34} className="fill-sig-dim font-mono" fontSize={10}>P</text>
        <text x={300} y={34} className="fill-sig-dim font-mono" fontSize={10}>S</text>
        {has && (
          <>
            <line x1={MID} y1={30} x2={nx} y2={30} stroke="var(--dossier-accent)" strokeWidth="3" />
            <circle cx={nx} cy={30} r={5} fill="var(--dossier-accent)" />
          </>
        )}
        <circle cx={MID} cy={30} r={3} className="fill-sig-bright" />
      </svg>
      <span className="shrink-0 text-(length:--sig-text-xs) text-sig-dim font-mono">{has ? label : "no data"}</span>
    </div>
  );
}
