import { AgeStyle, relativeAge } from "@/lib/format/timeFormat";
import {
  DossierMetric,
  DossierMetricValueClass,
} from "@/dossier";
import { formatLat, formatLon } from "@/lib/format/geoFormat";
import { formatKmMi } from "@/measurements";
import { mmiBand, isShallow } from "../intensity";

export function QuakeIdentityCard({
  magnitude,
  magType,
  mmi,
  depthKm,
  location,
  lat,
  lon,
  felt,
  significance,
  timestamp,
  status,
}: {
  readonly magnitude: number;
  readonly magType?: string;
  readonly mmi: number;
  readonly depthKm?: number;
  readonly location?: string;
  readonly lat: number;
  readonly lon: number;
  readonly felt?: number;
  readonly significance?: number;
  readonly timestamp?: string;
  readonly status?: string;
}) {
  const band = mmiBand(mmi);
  const age = timestamp
    ? relativeAge(new Date(timestamp).getTime(), AgeStyle.Verbose)
    : null;
  const cardClass = `${band.className} relative rounded-2xl overflow-hidden border border-(--dossier-accent)/40 bg-sig-panel`;

  return (
    <div className={cardClass}>
      <div className="absolute inset-0 bg-(--dossier-accent)/6 pointer-events-none" />
      <div className="relative h-1 bg-(--dossier-accent)" />
      <div className="relative px-4 pt-3 pb-3">
        <div className="absolute top-3 right-4 flex flex-col items-center justify-center min-w-14 h-14 px-2.5 rounded-[12px] border-2 border-(--dossier-accent) text-(--dossier-accent)">
          <span className="text-(length:--sig-text-lg) font-bold leading-none whitespace-nowrap">{band.roman}</span>
          <span className="text-(length:--sig-text-xs) tracking-widest mt-0.5">MMI</span>
        </div>

        <div className="pr-24 text-(length:--sig-text-xs) tracking-widest text-(--dossier-accent) font-semibold">
          SEISMIC EVENT · {band.label}
        </div>
        <div className="pr-24 text-(length:--sig-text-md) text-sig-bright font-bold tracking-wide leading-snug mt-1 mb-3">
          {location || "Unknown location"}
        </div>

        <div className="flex items-end gap-5 flex-wrap">
          <DossierMetric
            label="MAGNITUDE"
            valueClass={DossierMetricValueClass.Title}
            value={
              <>
                {magnitude.toFixed(1)}
                {magType && (
                  <span className="text-(length:--sig-text-sm) text-sig-dim ml-1">
                    {magType}
                  </span>
                )}
              </>
            }
          />

          {depthKm != null && (
            <DossierMetric
              value={formatKmMi(depthKm)}
              label={
                <>
                  DEPTH · {isShallow(depthKm) ? "shallow" : "deep"}
                </>
              }
            />
          )}

          <DossierMetric
            label="POSITION"
            value={
              <>
                {formatLat(lat)}, {formatLon(lon)}
              </>
            }
          />

          {significance != null && (
            <DossierMetric label="SIGNIFICANCE" value={significance} />
          )}

          {felt != null && felt > 0 && (
            <DossierMetric label="FELT REPORTS" value={felt} />
          )}
        </div>
      </div>

      <div className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-(--dossier-accent)/20 bg-sig-bg/40 px-4 py-2 text-(length:--sig-text-xs) text-sig-dim">
        <span className="shrink-0">SOURCE <span className="text-sig-text">USGS{status ? ` · ${status}` : ""}</span></span>
        {age && <span className="min-w-0">{age}</span>}
      </div>
    </div>
  );
}
