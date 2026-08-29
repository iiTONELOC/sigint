import { Sun, Moon } from "lucide-react";
import {
  DossierIdentityCard,
  DossierMetric,
  DossierMetricValueClass,
} from "@/dossier";
import { formatLat, formatLon } from "@/geo";
import { AgeStyle, relativeAge } from "@/time";
import { SettingsAboutSource } from "@/settings/model/about";
import { FirePassLabel } from "../formatters/presentation";
import { formatPixelKm } from "../formatters/units";
import {
  confidenceMeta,
  fireAnomalyStrength,
  frpBand,
} from "../intensity";
import { FireDayNight } from "@shared/domain/fireDayNight";

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
  const age = timestamp
    ? relativeAge(new Date(timestamp).getTime(), AgeStyle.Verbose)
    : null;
  const isNight = daynight === FireDayNight.Night;
  const PassIcon = isNight ? Moon : Sun;
  const source = [satellite, instrument].filter(Boolean).join(" · ");
  const sourceLabel = [SettingsAboutSource.Fires, source, version].filter(Boolean).join(" · ");

  return (
    <DossierIdentityCard age={age} source={sourceLabel}>
      <div className="absolute top-3 right-4 flex flex-col items-center justify-center min-w-14 h-14 px-2.5 rounded-[12px] border-2 border-(--dossier-accent) text-(--dossier-accent)">
        <span className="text-(length:--sig-text-md) font-bold leading-none whitespace-nowrap">{conf.label}</span>
        <span className="text-(length:--sig-text-xs) tracking-widest mt-0.5">CONF</span>
      </div>

      <div className="pr-24 text-(length:--sig-text-xs) tracking-widest text-(--dossier-accent) font-semibold">
        ACTIVE FIRE · {band.label}
      </div>
      <div className="pr-24 flex items-center gap-2 text-(length:--sig-text-md) text-sig-bright font-bold tracking-wide leading-snug mt-1 mb-3">
        <PassIcon className="w-4 h-4 shrink-0 text-sig-dim" aria-hidden />
        <span className="font-mono">{formatLat(lat)}, {formatLon(lon)}</span>
      </div>

      <div className="flex items-end gap-5 flex-wrap">
        <DossierMetric
          label="RADIATIVE POWER"
          valueClass={DossierMetricValueClass.Title}
          value={
            <>
              {(frp ?? 0).toFixed(1)}
              <span className="text-(length:--sig-text-sm) text-sig-dim ml-1">
                MW
              </span>
            </>
          }
        />

        {deltaT != null && (
          <DossierMetric
            value={`${deltaT.toFixed(0)} K`}
            label={
              <>
                THERMAL Δ · {fireAnomalyStrength(deltaT)}
              </>
            }
          />
        )}

        {scan != null && track != null && (
          <DossierMetric
            label="FOOTPRINT"
            value={formatPixelKm(scan, track)}
          />
        )}

        <DossierMetric
          label="PASS"
          value={
            isNight
              ? FirePassLabel.NightUppercase
              : FirePassLabel.DayUppercase
          }
        />
      </div>
    </DossierIdentityCard>
  );
}
