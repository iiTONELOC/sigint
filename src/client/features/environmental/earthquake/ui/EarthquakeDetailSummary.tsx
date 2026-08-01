import type { DataPoint } from "@/features/base/dataPoints";
import { DetailField, DetailFieldAlign } from "@/dossier";
import { formatLat, formatLon } from "@/geo";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { formatKmMi } from "@/measurements";
import { EMPTY_TEXT, NO_VALUE } from "@shared/text";
import { estimateMmi, mmiBand, isShallow } from "../intensity";
import type { EarthquakeData } from "../types";
import { EarthquakeCopy } from "../formatters";

enum EarthquakeDetailLabel {
  Position = "POSITION",
}

function depthClassification(depth: number | undefined): string {
  if (depth === undefined) return EMPTY_TEXT;
  return isShallow(depth) ? "shallow" : "deep";
}

export function EarthquakeDetailSummary({ item }: { readonly item: DataPoint }) {
  const d = item.data as EarthquakeData;
  const magnitude = d.magnitude ?? 0;
  const magType = d.magType ?? "";
  const { depth, felt, significance, status } = d;
  const place = d.location ?? EarthquakeCopy.UnknownLocation;
  const band = mmiBand(estimateMmi(magnitude, depth));

  return (
    <div className={`${band.className} pt-2.5 border-t border-sig-border`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--sig-text-lg) font-bold text-sig-bright leading-none">
            M{magnitude.toFixed(1)}
            {magType && <span className="text-(length:--sig-text-xs) text-sig-dim ml-1">{magType}</span>}
          </div>
          <div className="text-(length:--sig-text-xs) text-sig-dim mt-1 truncate">{place}</div>
        </div>
        <span className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 border border-(--dossier-accent) text-(--dossier-accent) whitespace-nowrap">
          {band.roman} · {band.label}
        </span>
      </div>

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <DetailField label="DEPTH" value={depth == null ? NO_VALUE : formatKmMi(depth)} />
          <DetailField
            label={EMPTY_TEXT}
            value={depthClassification(depth)}
            align={DetailFieldAlign.Right}
          />
        </div>
        <div className="flex justify-between gap-4">
          <DetailField label="SIGNIFICANCE" value={significance == null ? NO_VALUE : String(significance)} />
          <DetailField label="REVIEW" value={status ?? NO_VALUE} align={DetailFieldAlign.Right} />
        </div>
        {felt != null && felt > 0 && (
          <div className="flex justify-between gap-4">
            <DetailField label="FELT" value={`${felt} reports`} />
            <DetailField label={EarthquakeDetailLabel.Position} value={`${formatLat(recordLatitude(item))}, ${formatLon(recordLongitude(item))}`} align={DetailFieldAlign.Right} />
          </div>
        )}
        {(felt == null || felt === 0) && (
          <DetailField label={EarthquakeDetailLabel.Position} value={`${formatLat(recordLatitude(item))}, ${formatLon(recordLongitude(item))}`} />
        )}
      </div>
    </div>
  );
}
