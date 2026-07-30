import type { DataPoint } from "@/features/base/dataPoints";
import { formatLat, formatLon } from "@/lib/format/geoFormat";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { formatPixelKm } from "@/lib/format/units";
import { frpBand, confidenceMeta, DELTA_T_DETECT_K } from "../intensity";

function Field({
  label,
  value,
  align = "left",
}: {
  readonly label: string;
  readonly value: string;
  readonly align?: "left" | "right";
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <div className="text-(length:--sig-text-xs) tracking-wide text-sig-dim">{label}</div>
      <div className="text-(length:--sig-text-sm) text-sig-bright truncate">{value}</div>
    </div>
  );
}

export function FireDetailSummary({ item }: { readonly item: DataPoint }) {
  const d = (item as { data?: Record<string, unknown> }).data ?? {};
  const frp = typeof d.frp === "number" ? d.frp : 0;
  const fireK = typeof d.brightness === "number" ? d.brightness : undefined;
  const bgK = typeof d.brightT31 === "number" ? d.brightT31 : undefined;
  const deltaT = fireK != null && bgK != null ? fireK - bgK : undefined;
  const scan = typeof d.scan === "number" ? d.scan : undefined;
  const track = typeof d.track === "number" ? d.track : undefined;
  const isNight = d.daynight === "N";
  const band = frpBand(frp);
  const conf = confidenceMeta(typeof d.confidence === "string" ? d.confidence : undefined);

  return (
    <div className="pt-2.5 border-t border-sig-border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--sig-text-lg) font-bold text-sig-bright leading-none">
            {frp.toFixed(1)}
            <span className="text-(length:--sig-text-xs) text-sig-dim ml-1">MW</span>
          </div>
          <div className="text-(length:--sig-text-xs) text-sig-dim mt-1 truncate">ACTIVE FIRE · {band.label}</div>
        </div>
        <span
          className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 border whitespace-nowrap"
          style={{ color: band.ink, borderColor: band.ink }}
        >
          {conf.label} CONF
        </span>
      </div>

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <Field label="THERMAL Δ" value={deltaT == null ? "—" : `${deltaT.toFixed(0)} K`} />
          <Field label="" value={deltaT == null ? "" : deltaT >= DELTA_T_DETECT_K ? "strong" : "weak"} align="right" />
        </div>
        <div className="flex justify-between gap-4">
          <Field label="FOOTPRINT" value={scan != null && track != null ? formatPixelKm(scan, track) : "—"} />
          <Field label="PASS" value={isNight ? "night" : "day"} align="right" />
        </div>
        <Field label="POSITION" value={`${formatLat(recordLatitude(item))}, ${formatLon(recordLongitude(item))}`} />
      </div>
    </div>
  );
}
