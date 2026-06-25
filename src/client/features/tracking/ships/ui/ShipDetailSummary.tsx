import type { DataPoint } from "@/features/base/dataPoints";
import { formatKtMph } from "@/lib/format/units";
import { mmsiCountry } from "@/panes/dossier/DossierAtoms";
import type { ShipData } from "../types";
import { navStatusMeta, setDrift } from "../shipMeta";

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

export function ShipDetailSummary({ item }: { readonly item: DataPoint }) {
  const d = (item.data as ShipData) ?? {};
  const nav = navStatusMeta(d.navStatus);
  const country = d.mmsi ? mmsiCountry(d.mmsi) : null;
  const kicker = ["AIS VESSEL", d.vesselType && d.vesselType !== "Unknown" ? d.vesselType : null, country]
    .filter(Boolean)
    .join(" · ");
  const drift = setDrift(d.heading, d.cog);
  const headingTxt = d.heading != null && d.heading !== 511 ? `${Math.round(d.heading)}°` : "—";

  return (
    <div className="pt-2.5 border-t border-sig-border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--sig-text-md) font-bold text-sig-bright leading-snug truncate">
            {d.name || `MMSI ${d.mmsi}`}
          </div>
          <div className="text-(length:--sig-text-xs) text-sig-dim mt-1 truncate">{kicker}</div>
        </div>
        <span
          className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap"
          style={{ color: "var(--sigint-ships)", borderColor: "var(--sigint-ships)" }}
        >
          {nav.alert ? "⚠ " : ""}{nav.label}
        </span>
      </div>

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <Field label="SPEED" value={d.sog != null ? formatKtMph(Math.round(d.sog)) : "—"} />
          <Field label="HEADING" value={headingTxt} align="right" />
        </div>
        <div className="flex justify-between gap-4">
          <Field label="COURSE" value={d.cog != null ? `${Math.round(d.cog)}°` : "—"} />
          <Field
            label="DRIFT"
            value={drift == null ? "—" : Math.abs(drift) < 1 ? "none" : `${Math.abs(Math.round(drift))}° ${drift > 0 ? "stbd" : "port"}`}
            align="right"
          />
        </div>
        <div className="flex justify-between gap-4">
          <Field label="DESTINATION" value={d.destination || "—"} />
          <Field label="ETA" value={d.eta || "—"} align="right" />
        </div>
      </div>
    </div>
  );
}
