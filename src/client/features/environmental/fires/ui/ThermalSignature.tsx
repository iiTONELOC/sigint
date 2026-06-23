import { formatTempCF } from "@/lib/format/units";
import { DELTA_T_DETECT_K, frpInk } from "../intensity";

// Brightness-temperature plotting domain (K). VIIRS background sits ~280–300 K;
// the I4 fire channel saturates near 367 K, so 270–400 K spans both with margin.
const T_MIN = 270;
const T_MAX = 400;

function pct(k: number): number {
  return Math.min(100, Math.max(0, ((k - T_MIN) / (T_MAX - T_MIN)) * 100));
}

export function ThermalSignature({
  fireK,
  bgK,
  frp,
}: {
  readonly fireK: number;
  readonly bgK: number;
  readonly frp: number;
}) {
  const deltaT = fireK - bgK;
  const ink = frpInk(frp);
  const strong = deltaT >= DELTA_T_DETECT_K;

  return (
    <div className="flex flex-col gap-2.5">
      <Channel label="I4 fire" k={fireK} pctW={pct(fireK)} color={ink} />
      <Channel label="I5 bg" k={bgK} pctW={pct(bgK)} color="var(--color-sig-dim)" />

      <div className="flex items-baseline gap-2 pt-1 border-t border-sig-border/60">
        <span className="text-(length:--sig-text-md) font-bold font-mono leading-none" style={{ color: ink }}>
          ΔT {deltaT.toFixed(0)} K
        </span>
        <span className="text-(length:--sig-text-xs) text-sig-bright tracking-wide">
          {strong ? "strong anomaly" : "weak anomaly"}
        </span>
        <span className="text-(length:--sig-text-xs) text-sig-dim truncate">· detection ≥ {DELTA_T_DETECT_K} K</span>
      </div>
    </div>
  );
}

function Channel({
  label,
  k,
  pctW,
  color,
}: {
  readonly label: string;
  readonly k: number;
  readonly pctW: number;
  readonly color: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-12 shrink-0 text-(length:--sig-text-xs) tracking-wider text-sig-dim">{label}</span>
      <div className="relative flex-1 h-3 rounded-[3px] bg-sig-bg/60 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${pctW}%`, background: color }} />
      </div>
      <span className="w-28 shrink-0 text-right font-mono text-(length:--sig-text-xs) text-sig-bright">
        {Math.round(k)} K · {formatTempCF(k)}
      </span>
    </div>
  );
}
