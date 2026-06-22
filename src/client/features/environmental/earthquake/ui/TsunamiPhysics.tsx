const G = 9.81;
const DEEP_OCEAN_M = 4000;
const SHELF_M = 200;
const SHORE_M = 20;

function speedKmh(depthM: number): number {
  return Math.sqrt(G * depthM) * 3.6;
}

export function TsunamiPhysics() {
  const rows = [
    { label: "DEEP OCEAN", depth: DEEP_OCEAN_M, note: "~4000 m" },
    { label: "SHELF", depth: SHELF_M, note: "~200 m" },
    { label: "NEAR SHORE", depth: SHORE_M, note: "~20 m" },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-2 text-(length:--sig-text-xs)">
          <span className="text-sig-dim tracking-wide">{r.label}</span>
          <span className="text-sig-bright font-mono">
            {Math.round(speedKmh(r.depth))} km/h
            <span className="text-sig-dim ml-1">{r.note}</span>
          </span>
        </div>
      ))}
      <div className="text-(length:--sig-text-xs) text-sig-dim mt-0.5">
        wave speed = √(g·depth) · slows toward shore
      </div>
    </div>
  );
}
