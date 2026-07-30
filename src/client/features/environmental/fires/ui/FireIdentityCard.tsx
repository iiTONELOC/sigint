import type { CSSProperties } from "react";
import { Sun, Moon } from "lucide-react";
import { relativeAge } from "@/lib/format/timeFormat";
import { formatLat, formatLon } from "@/lib/format/geoFormat";
import { formatPixelKm } from "@/lib/format/units";
import { frpBand, confidenceMeta, DELTA_T_DETECT_K } from "../intensity";

export function FireIdentityCard({
  frp,
  confidence,
  fireK,
  bgK,
  lat,
  lon,
  scan,
  track,
  daynight,
  satellite,
  instrument,
  version,
  timestamp,
}: {
  readonly frp?: number;
  readonly confidence?: string;
  readonly fireK?: number;
  readonly bgK?: number;
  readonly lat: number;
  readonly lon: number;
  readonly scan?: number;
  readonly track?: number;
  readonly daynight?: string;
  readonly satellite?: string;
  readonly instrument?: string;
  readonly version?: string;
  readonly timestamp?: string;
}) {
  const band = frpBand(frp ?? 0);
  const conf = confidenceMeta(confidence);
  const deltaT = fireK != null && bgK != null ? fireK - bgK : undefined;
  const age = timestamp ? relativeAge(new Date(timestamp).getTime(), "verbose") : null;
  const isNight = daynight === "N";
  const PassIcon = isNight ? Moon : Sun;
  const source = [satellite, instrument].filter(Boolean).join(" · ");

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-(--dossier-accent)/40 bg-sig-panel"
      style={{ "--dossier-accent": band.ink } as CSSProperties}
    >
      <div className="absolute inset-0 bg-(--dossier-accent)/6 pointer-events-none" />
      <div className="relative h-1 bg-(--dossier-accent)" />
      <div className="relative px-4 pt-3 pb-3">
        <div className="absolute top-3 right-4 flex flex-col items-center justify-center min-w-14 h-14 px-2.5 rounded-[12px] border-2 border-(--dossier-accent) text-(--dossier-accent)">
          <span className="text-(length:--sig-text-md) font-bold leading-none whitespace-nowrap">{conf.label}</span>
          <span className="text-(length:--sig-text-xs) tracking-widest mt-0.5">CONF</span>
        </div>

        <div className="pr-24 text-(length:--sig-text-xs) tracking-widest text-(--dossier-accent) font-semibold">
          ACTIVE FIRE · {band.label}
        </div>
        <div className="pr-24 flex items-center gap-2 text-(length:--sig-text-md) text-sig-bright font-bold tracking-wide leading-snug mt-1 mb-3">
          <PassIcon className="w-4 h-4 shrink-0 text-sig-dim" aria-hidden="true" />
          <span className="font-mono">{formatLat(lat)}, {formatLon(lon)}</span>
        </div>

        <div className="flex items-end gap-5 flex-wrap">
          <div className="leading-none">
            <div className="text-(length:--sig-text-title) text-sig-bright font-bold">
              {(frp ?? 0).toFixed(1)}
              <span className="text-(length:--sig-text-sm) text-sig-dim ml-1">MW</span>
            </div>
            <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim mt-1">RADIATIVE POWER</div>
          </div>

          {deltaT != null && (
            <div className="leading-none">
              <div className="text-(length:--sig-text-md) text-sig-bright font-mono">{deltaT.toFixed(0)} K</div>
              <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim mt-1">
                THERMAL Δ · {deltaT >= DELTA_T_DETECT_K ? "strong" : "weak"}
              </div>
            </div>
          )}

          {scan != null && track != null && (
            <div className="leading-none">
              <div className="text-(length:--sig-text-md) text-sig-bright font-mono">{formatPixelKm(scan, track)}</div>
              <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim mt-1">FOOTPRINT</div>
            </div>
          )}

          <div className="leading-none">
            <div className="text-(length:--sig-text-md) text-sig-bright font-mono">{isNight ? "NIGHT" : "DAY"}</div>
            <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim mt-1">PASS</div>
          </div>
        </div>
      </div>

      <div className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-(--dossier-accent)/20 bg-sig-bg/40 px-4 py-2 text-(length:--sig-text-xs) text-sig-dim">
        <span className="shrink-0">
          SOURCE <span className="text-sig-text">NASA FIRMS{source ? ` · ${source}` : ""}{version ? ` · ${version}` : ""}</span>
        </span>
        {age && <span className="min-w-0">{age}</span>}
      </div>
    </div>
  );
}
