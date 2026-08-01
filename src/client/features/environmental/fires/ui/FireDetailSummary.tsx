import type { DataPoint } from "@/features/base/dataPoints";
import { DetailField, DetailFieldAlign } from "@/dossier";
import { formatLat, formatLon } from "@/lib/format/geoFormat";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { formatPixelKm } from "../formatters";
import { NO_VALUE } from "@shared/text";
import {
  confidenceMeta,
  fireAnomalyStrength,
  frpBand,
} from "../intensity";
import { FireDayNight } from "@shared/domain/fireDayNight";
import { FirePassLabel, type FireData } from "../types";

export function FireDetailSummary({ item }: { readonly item: DataPoint }) {
  const d = item.data as FireData;
  const frp = d.frp ?? 0;
  const fireK = d.brightness;
  const bgK = d.brightT31;
  const deltaT = fireK != null && bgK != null ? fireK - bgK : undefined;
  const { scan, track } = d;
  const isNight = d.daynight === FireDayNight.Night;
  const band = frpBand(frp);
  const conf = confidenceMeta(d.confidence);
  const anomaly = deltaT == null ? null : fireAnomalyStrength(deltaT);

  return (
    <div className={`${band.className} pt-2.5 border-t border-sig-border`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--sig-text-lg) font-bold text-sig-bright leading-none">
            {frp.toFixed(1)}
            <span className="text-(length:--sig-text-xs) text-sig-dim ml-1">MW</span>
          </div>
          <div className="text-(length:--sig-text-xs) text-sig-dim mt-1 truncate">ACTIVE FIRE · {band.label}</div>
        </div>
        <span className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 border border-(--dossier-accent) text-(--dossier-accent) whitespace-nowrap">
          {conf.label} CONF
        </span>
      </div>

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <DetailField label="THERMAL Δ" value={deltaT == null ? NO_VALUE : `${deltaT.toFixed(0)} K`} />
          <DetailField
            label=""
            value={anomaly ?? ""}
            align={DetailFieldAlign.Right}
          />
        </div>
        <div className="flex justify-between gap-4">
          <DetailField label="FOOTPRINT" value={scan != null && track != null ? formatPixelKm(scan, track) : NO_VALUE} />
          <DetailField
            label="PASS"
            value={isNight ? FirePassLabel.Night : FirePassLabel.Day}
            align={DetailFieldAlign.Right}
          />
        </div>
        <DetailField label="POSITION" value={`${formatLat(recordLatitude(item))}, ${formatLon(recordLongitude(item))}`} />
      </div>
    </div>
  );
}
