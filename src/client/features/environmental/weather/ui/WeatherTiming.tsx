import { HOURS_PER_DAY, MINUTES_PER_HOUR, MS_PER_MINUTE } from "@shared/time";
import { NO_VALUE } from "@shared/text";

enum WeatherTimingState {
  Live = "var(--dossier-accent)",
  Soon = "var(--color-sig-warn)",
  Past = "var(--color-sig-dim)",
}

const CLOCK_DIGITS = "2-digit";

function fmtDelta(ms: number): string {
  const minutes = Math.round(ms / MS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const spareMinutes = minutes % MINUTES_PER_HOUR;
  if (hours < HOURS_PER_DAY) {
    return spareMinutes > 0 ? `${hours}h ${spareMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / HOURS_PER_DAY);
  return `${days}d ${hours % HOURS_PER_DAY}h`;
}

function fmtClock(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: CLOCK_DIGITS, minute: CLOCK_DIGITS });
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
  const ons = onset ? new Date(onset).getTime() : Number.NaN;
  const exp = expires ? new Date(expires).getTime() : Number.NaN;

  let status: string;
  let state = WeatherTimingState.Live;
  if (Number.isFinite(exp) && exp <= now) {
    status = "EXPIRED";
    state = WeatherTimingState.Past;
  } else if (Number.isFinite(ons) && ons > now) {
    status = `begins in ${fmtDelta(ons - now)}`;
    state = WeatherTimingState.Soon;
  } else if (Number.isFinite(exp)) {
    status = `expires in ${fmtDelta(exp - now)}`;
  } else {
    status = "in effect";
  }

  const hasBar = Number.isFinite(ons) && Number.isFinite(exp) && exp > ons;
  const pct = hasBar ? Math.min(100, Math.max(0, ((now - ons) / (exp - ons)) * 100)) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-(length:--sig-text-md) font-bold" style={{ color: state }}>{status}</span>
        {state === WeatherTimingState.Live && <span className="text-(length:--sig-text-xs) text-sig-dim">in effect now</span>}
      </div>
      {hasBar && (
        <div className="relative h-1.5 w-full rounded-full bg-sig-border overflow-hidden">
          <div className="absolute inset-y-0 left-0 rounded-full bg-(--dossier-accent)" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="flex justify-between text-(length:--sig-text-xs) text-sig-dim font-mono">
        <span>{onset ? fmtClock(onset) : NO_VALUE}</span>
        <span>{expires ? fmtClock(expires) : NO_VALUE}</span>
      </div>
    </div>
  );
}
