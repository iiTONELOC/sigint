// ── RouteProgress ────────────────────────────────────────────────────
// Schematic origin → destination strip with the aircraft placed by progress.
// We have no airport coordinates, so the line is NOT geographic — but the
// position along it is real, driven by departure/arrival time. Pure SVG.

const W = 300;
const H = 54;
const X0 = 24;
const X1 = W - 24;
const Y = 22;

function fmtDur(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function RouteProgress({
  origin,
  dest,
  departureTime,
  arrivalTime,
}: {
  readonly origin: string;
  readonly dest: string;
  readonly departureTime?: number;
  readonly arrivalTime?: number;
}) {
  if (!departureTime || !arrivalTime || arrivalTime <= departureTime) return null;

  const now = Date.now() / 1000;
  const frac = Math.max(0, Math.min(1, (now - departureTime) / (arrivalTime - departureTime)));
  const planeX = X0 + frac * (X1 - X0);

  const ac = "var(--sigint-aircraft, #f5c451)";
  const dim = "var(--sigint-dim, #6b7a8d)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Flight progress">
      {/* Endpoint codes */}
      <text x={X0} y={11} fontSize={11} fontFamily="monospace" fontWeight={700} fill="var(--sigint-text, #c8d4e0)">
        {origin || "—"}
      </text>
      <text x={X1} y={11} textAnchor="end" fontSize={11} fontFamily="monospace" fontWeight={700} fill="var(--sigint-text, #c8d4e0)">
        {dest || "—"}
      </text>

      {/* Remaining (dim) then flown (accent) */}
      <line x1={X0} y1={Y} x2={X1} y2={Y} stroke={dim} strokeOpacity={0.4} strokeWidth={2} strokeDasharray="3 3" />
      <line x1={X0} y1={Y} x2={planeX} y2={Y} stroke={ac} strokeOpacity={0.45} strokeWidth={2} />
      <circle cx={X0} cy={Y} r={3} fill={dim} />
      <circle cx={X1} cy={Y} r={3} fill="none" stroke={dim} strokeWidth={1.5} />

      {/* Aircraft at progress, nose toward destination */}
      <g transform={`translate(${planeX.toFixed(1)},${Y})`}>
        <path d="M7,0 L-5,4.5 L-2,0 L-5,-4.5 Z" fill={ac} stroke="#000" strokeWidth={0.5} />
      </g>

      {/* Elapsed / remaining */}
      <text x={X0} y={H - 6} fontSize={10} fontFamily="monospace" fill={dim}>
        {`+${fmtDur(now - departureTime)}`}
      </text>
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={10} fontFamily="monospace" fill="var(--sigint-text, #c8d4e0)">
        {`${Math.round(frac * 100)}%`}
      </text>
      <text x={X1} y={H - 6} textAnchor="end" fontSize={10} fontFamily="monospace" fill={dim}>
        {`-${fmtDur(arrivalTime - now)}`}
      </text>
    </svg>
  );
}
