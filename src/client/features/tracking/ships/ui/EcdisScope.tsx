// North-up ECDIS/radar scope: own-ship at center, a bright HEADING line (bow),
// a dashed COURSE vector (COG, length ∝ SOG), range rings + compass ticks. The
// angle between heading line and course vector is the set/drift, shown the way a
// bridge display shows it. Accent rides the ships layer color (--dossier-accent).

const C = 160;
const R = 148;
const TICKS = Array.from({ length: 36 }, (_, i) => i * 10);
const CONTACTS: ReadonlyArray<[number, number]> = [[40, 250], [262, 120], [212, 252]];

function brg(deg: number, r: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + Math.cos(a) * r, C + Math.sin(a) * r];
}

export function EcdisScope({
  heading,
  cog,
  sog,
}: {
  readonly heading?: number;
  readonly cog?: number;
  readonly sog?: number;
}) {
  const hasHeading = heading != null && heading !== 511;
  const hasCog = cog != null;
  const vecLen = Math.min(120, 30 + (sog ?? 0) * 4);

  const [hx, hy] = hasHeading ? brg(heading, R - 8) : [C, C];
  const [vx, vy] = hasCog ? brg(cog, vecLen) : [C, C];
  const [al, ar] = hasCog ? [brg(cog - 4, vecLen - 12), brg(cog + 4, vecLen - 12)] : [[C, C], [C, C]];

  return (
    <svg viewBox="0 0 320 320" className="block mx-auto w-full max-w-75" role="img" aria-label="Navigation scope">
      {[R, R * 0.66, R * 0.33].map((r) => (
        <circle key={r} cx={C} cy={C} r={r} fill="none" className="stroke-sig-border" strokeWidth="1" />
      ))}
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--dossier-accent)" strokeOpacity="0.5" strokeWidth="1.5" />

      <line x1={C} y1={C - R} x2={C} y2={C + R} className="stroke-sig-border" strokeWidth="0.6" strokeDasharray="2 4" />
      <line x1={C - R} y1={C} x2={C + R} y2={C} className="stroke-sig-border" strokeWidth="0.6" strokeDasharray="2 4" />

      {TICKS.map((d) => {
        const major = d % 30 === 0;
        const [x1, y1] = brg(d, R);
        const [x2, y2] = brg(d, R - (major ? 12 : 6));
        return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-sig-dim" strokeWidth={major ? 1.3 : 0.8} />;
      })}
      {["N", "E", "S", "W"].map((c, i) => {
        const [x, y] = brg(i * 90, R - 26);
        return <text key={c} x={x} y={y + 4} textAnchor="middle" className="fill-sig-bright font-mono" fontSize={13}>{c}</text>;
      })}

      {CONTACTS.map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x},${y - 5} L${x + 4},${y + 3} L${x - 4},${y + 3} Z`} className="fill-sig-dim" fillOpacity="0.6" />
      ))}

      {hasCog && (
        <>
          <line x1={C} y1={C} x2={vx} y2={vy} stroke="var(--dossier-accent)" strokeWidth="2" strokeDasharray="5 4" />
          <path d={`M${vx},${vy} L${al[0]},${al[1]} L${ar[0]},${ar[1]} Z`} fill="var(--dossier-accent)" />
        </>
      )}
      {hasHeading && <line x1={C} y1={C} x2={hx} y2={hy} className="stroke-sig-bright" strokeWidth="1.5" />}

      <g transform={`rotate(${hasHeading ? heading : 0} ${C} ${C})`}>
        <path
          d={`M${C},${C - 13} L${C + 6},${C - 4} L${C + 6},${C + 11} L${C - 6},${C + 11} L${C - 6},${C - 4} Z`}
          fill="color-mix(in srgb, var(--dossier-accent) 20%, transparent)"
          stroke="var(--dossier-accent)"
          strokeWidth="1.6"
        />
      </g>

      <path d={`M${C - 6},6 L${C + 6},6 L${C},16 Z`} className="fill-sig-bright" />
      <rect x={C - 34} y={C + R - 18} width={68} height={18} rx={2} className="fill-sig-bg stroke-sig-dim" />
      <text x={C} y={C + R - 4} textAnchor="middle" className="fill-sig-bright font-mono" fontSize={12} fontWeight={700}>
        {hasHeading ? `HDG ${Math.round(heading)}` : "HDG —"} · {hasCog ? `COG ${Math.round(cog)}` : "COG —"}
      </text>
    </svg>
  );
}
