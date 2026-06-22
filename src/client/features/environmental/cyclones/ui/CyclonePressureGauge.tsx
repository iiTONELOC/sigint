const MIN_HPA = 800;
const MAX_HPA = 1100;
const CX = 32;
const CY = 30;
const R = 24;
const START_DEG = 180;
const SWEEP_DEG = 180;

function polar(deg: number, radius: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + Math.cos(a) * radius, CY - Math.sin(a) * radius];
}

function arcPath(fromDeg: number, toDeg: number, radius: number): string {
  const [x0, y0] = polar(fromDeg, radius);
  const [x1, y1] = polar(toDeg, radius);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  const sweep = toDeg < fromDeg ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${radius},${radius} 0 ${large} ${sweep} ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

function needleDeg(pressureHpa: number): number {
  const clamped = Math.min(MAX_HPA, Math.max(MIN_HPA, pressureHpa));
  const frac = (clamped - MIN_HPA) / (MAX_HPA - MIN_HPA);
  return START_DEG - frac * SWEEP_DEG;
}

export function CyclonePressureGauge({ pressureHpa }: { readonly pressureHpa: number }) {
  const deg = needleDeg(pressureHpa);
  const [nx, ny] = polar(deg, R - 3);

  return (
    <svg
      viewBox="0 0 64 40"
      className="h-9 w-16 shrink-0 text-(--dossier-accent)"
      role="img"
      aria-label={`Pressure ${Math.round(pressureHpa)} hectopascal`}
    >
      <path d={arcPath(START_DEG, 0, R)} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} strokeLinecap="round" />
      <path d={arcPath(START_DEG, deg, R)} fill="none" stroke="currentColor" strokeOpacity={0.9} strokeWidth={3} strokeLinecap="round" />
      <line x1={CX} y1={CY} x2={nx.toFixed(2)} y2={ny.toFixed(2)} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={CX} cy={CY} r={2} fill="currentColor" />
    </svg>
  );
}
