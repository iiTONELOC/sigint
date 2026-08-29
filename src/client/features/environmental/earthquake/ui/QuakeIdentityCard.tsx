import { AgeStyle, relativeAge } from "@/time";
import {
  DossierIdentityCard,
  DossierMetric,
  DossierMetricValueClass,
} from "@/dossier";
import { formatLat, formatLon } from "@/geo";
import { formatKmMi } from "@/measurements";
import { isShallow } from "../intensity";
import { EarthquakeCopy } from "../formatters/presentation";

export function QuakeIdentityCard({
  magnitude,
  magType,
  mmiRoman,
  mmiLabel,
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
  readonly mmiRoman: string;
  readonly mmiLabel: string;
  readonly depthKm?: number;
  readonly location?: string;
  readonly lat: number;
  readonly lon: number;
  readonly felt?: number;
  readonly significance?: number;
  readonly timestamp?: string;
  readonly status?: string;
}) {
  const age = timestamp
    ? relativeAge(new Date(timestamp).getTime(), AgeStyle.Verbose)
    : null;
  const source = [EarthquakeCopy.Source, status].filter(Boolean).join(" · ");

  return (
    <DossierIdentityCard age={age} source={source}>
      <div className="absolute top-3 right-4 flex flex-col items-center justify-center min-w-14 h-14 px-2.5 rounded-[12px] border-2 border-(--dossier-accent) text-(--dossier-accent)">
        <span className="text-(length:--sig-text-lg) font-bold leading-none whitespace-nowrap">{mmiRoman}</span>
        <span className="text-(length:--sig-text-xs) tracking-widest mt-0.5">MMI</span>
      </div>

      <div className="pr-24 text-(length:--sig-text-xs) tracking-widest text-(--dossier-accent) font-semibold">
        SEISMIC EVENT · {mmiLabel}
      </div>
      <div className="pr-24 text-(length:--sig-text-md) text-sig-bright font-bold tracking-wide leading-snug mt-1 mb-3">
        {location || EarthquakeCopy.UnknownLocation}
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
    </DossierIdentityCard>
  );
}
