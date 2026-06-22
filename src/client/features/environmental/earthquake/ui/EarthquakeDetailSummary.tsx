import type { DataPoint } from "@/features/base/dataPoints";
import { formatLat, formatLon } from "@/lib/format/geoFormat";
import { formatKmMi } from "@/lib/format/units";
import { estimateMmi, mmiBand, isShallow } from "../intensity";

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

export function EarthquakeDetailSummary({ item }: { readonly item: DataPoint }) {
  const d = (item as { data?: Record<string, unknown> }).data ?? {};
  const magnitude = typeof d.magnitude === "number" ? d.magnitude : 0;
  const magType = typeof d.magType === "string" ? d.magType : "";
  const depth = typeof d.depth === "number" ? d.depth : undefined;
  const place = typeof d.location === "string" ? d.location : "Unknown location";
  const felt = typeof d.felt === "number" ? d.felt : undefined;
  const significance = typeof d.significance === "number" ? d.significance : undefined;
  const status = typeof d.status === "string" ? d.status : undefined;
  const band = mmiBand(estimateMmi(magnitude, depth));

  return (
    <div className="pt-2.5 border-t border-sig-border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--sig-text-lg) font-bold text-sig-bright leading-none">
            M{magnitude.toFixed(1)}
            {magType && <span className="text-(length:--sig-text-xs) text-sig-dim ml-1">{magType}</span>}
          </div>
          <div className="text-(length:--sig-text-xs) text-sig-dim mt-1 truncate">{place}</div>
        </div>
        <span
          className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 border whitespace-nowrap"
          style={{ color: band.ink, borderColor: band.ink }}
        >
          {band.roman} · {band.label}
        </span>
      </div>

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <Field label="DEPTH" value={depth == null ? "—" : formatKmMi(depth)} />
          <Field label="" value={depth == null ? "" : isShallow(depth) ? "shallow" : "deep"} align="right" />
        </div>
        <div className="flex justify-between gap-4">
          <Field label="SIGNIFICANCE" value={significance == null ? "—" : String(significance)} />
          <Field label="REVIEW" value={status ?? "—"} align="right" />
        </div>
        {felt != null && felt > 0 && (
          <div className="flex justify-between gap-4">
            <Field label="FELT" value={`${felt} reports`} />
            <Field label="POSITION" value={`${formatLat(item.lat)}, ${formatLon(item.lon)}`} align="right" />
          </div>
        )}
        {(felt == null || felt === 0) && (
          <Field label="POSITION" value={`${formatLat(item.lat)}, ${formatLon(item.lon)}`} />
        )}
      </div>
    </div>
  );
}
