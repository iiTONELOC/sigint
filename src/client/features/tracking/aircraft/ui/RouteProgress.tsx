function fmtDur(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

type Props = {
  readonly origin: string;
  readonly dest: string;
  readonly departureTime?: number;
  readonly arrivalTime?: number;
};

export function RouteProgress({ origin, dest, departureTime, arrivalTime }: Props) {
  if (!departureTime || !arrivalTime || arrivalTime <= departureTime) return null;

  const now = Date.now() / 1000;
  const frac = Math.max(0, Math.min(1, (now - departureTime) / (arrivalTime - departureTime)));
  const pct = `${frac * 100}%`;

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-(length:--sig-text-sm) font-semibold font-mono text-sig-bright">
          {origin || "—"}
        </span>
        <span className="text-(length:--sig-text-sm) font-semibold font-mono text-sig-bright">
          {dest || "—"}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-sig-border">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-(--dossier-accent)"
          style={{ width: pct }}
        />
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--dossier-accent) border border-sig-bg"
          style={{ left: pct }}
        />
      </div>
      <div className="flex items-baseline justify-between mt-1.5 font-mono">
        <span className="text-(length:--sig-text-xs) text-sig-dim">+{fmtDur(now - departureTime)}</span>
        <span className="text-(length:--sig-text-xs) text-(--dossier-accent)">
          {Math.round(frac * 100)}%
        </span>
        <span className="text-(length:--sig-text-xs) text-sig-dim">-{fmtDur(arrivalTime - now)}</span>
      </div>
    </div>
  );
}
