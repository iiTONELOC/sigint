// Top-down hull drawn to scale from the AIS reference dimensions:
//   A = bow→antenna, B = antenna→stern, C = port→antenna, D = antenna→stbd
// so length = A+B, beam = C+D, and the GPS antenna sits at (C from port,
// A from bow). Bow points up; the dot marks the transponder's hull position.

export function VesselSilhouette({
  dimA,
  dimB,
  dimC,
  dimD,
  length,
  width,
  draught,
}: {
  readonly dimA?: number;
  readonly dimB?: number;
  readonly dimC?: number;
  readonly dimD?: number;
  readonly length?: number;
  readonly width?: number;
  readonly draught?: number;
}) {
  const a = dimA ?? 0;
  const b = dimB ?? 0;
  const c = dimC ?? 0;
  const dd = dimD ?? 0;
  const L = a + b || length || 0;
  const W = c + dd || width || 0;

  if (L <= 0 || W <= 0) {
    return <div className="text-(length:--sig-text-xs) text-sig-dim">no dimensions reported</div>;
  }

  const antX = c + dd > 0 ? c : W / 2;
  const antY = a + b > 0 ? a : L / 2;
  const shoulder = Math.min(L * 0.18, W); // bow taper length
  const boxH = 150;
  const boxW = Math.max(22, Math.min(110, boxH * (W / L)));

  const hull = `M ${W / 2} 0 L ${W} ${shoulder} L ${W} ${L} L 0 ${L} L 0 ${shoulder} Z`;

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox={`-2 -2 ${W + 4} ${L + 4}`}
        width={boxW}
        height={boxH}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Vessel hull to scale"
        className="shrink-0"
      >
        <path d={hull} fill="var(--dossier-accent)" fillOpacity="0.14" stroke="var(--dossier-accent)" strokeWidth={Math.max(W, L) * 0.012} vectorEffect="non-scaling-stroke" />
        <circle cx={antX} cy={antY} r={Math.max(W, L) * 0.035} fill="var(--dossier-accent)" />
      </svg>
      <div className="min-w-0 flex flex-col gap-1.5 font-mono text-(length:--sig-text-sm) text-sig-bright">
        <div>{Math.round(L)} m <span className="text-sig-dim font-sans text-(length:--sig-text-xs)">LENGTH</span></div>
        <div>{Math.round(W)} m <span className="text-sig-dim font-sans text-(length:--sig-text-xs)">BEAM</span></div>
        {draught != null && draught > 0 && (
          <div>{draught.toFixed(1)} m <span className="text-sig-dim font-sans text-(length:--sig-text-xs)">DRAUGHT</span></div>
        )}
        <div className="text-(length:--sig-text-xs) text-sig-dim font-sans">● GPS antenna position</div>
      </div>
    </div>
  );
}
