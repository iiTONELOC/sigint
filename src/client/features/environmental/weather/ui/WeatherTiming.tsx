function fmtDelta(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d ${h % 24}h`;
}

function fmtClock(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function WeatherTiming({
  onset,
  expires,
  now,
}: {
  readonly onset?: string;
  readonly expires?: string;
  readonly now: number;
}) {
  const ons = onset ? new Date(onset).getTime() : NaN;
  const exp = expires ? new Date(expires).getTime() : NaN;

  let status: string;
  let emphasis: "live" | "soon" | "past" = "live";
  if (Number.isFinite(exp) && exp <= now) {
    status = "EXPIRED";
    emphasis = "past";
  } else if (Number.isFinite(ons) && ons > now) {
    status = `begins in ${fmtDelta(ons - now)}`;
    emphasis = "soon";
  } else if (Number.isFinite(exp)) {
    status = `expires in ${fmtDelta(exp - now)}`;
    emphasis = "live";
  } else {
    status = "in effect";
  }

  const hasBar = Number.isFinite(ons) && Number.isFinite(exp) && exp > ons;
  const pct = hasBar ? Math.min(100, Math.max(0, ((now - ons) / (exp - ons)) * 100)) : 0;
  const statusColor =
    emphasis === "past" ? "var(--color-sig-dim)" : emphasis === "soon" ? "var(--color-sig-warn)" : "var(--dossier-accent)";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-(length:--sig-text-md) font-bold" style={{ color: statusColor }}>{status}</span>
        {emphasis === "live" && <span className="text-(length:--sig-text-xs) text-sig-dim">in effect now</span>}
      </div>
      {hasBar && (
        <div className="relative h-1.5 w-full rounded-full bg-sig-border overflow-hidden">
          <div className="absolute inset-y-0 left-0 rounded-full bg-(--dossier-accent)" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="flex justify-between text-(length:--sig-text-xs) text-sig-dim font-mono">
        <span>{onset ? fmtClock(onset) : "—"}</span>
        <span>{expires ? fmtClock(expires) : "—"}</span>
      </div>
    </div>
  );
}
