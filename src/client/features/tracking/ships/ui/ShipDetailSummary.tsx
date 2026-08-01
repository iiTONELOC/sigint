import type { DataPoint } from "@/features/base/dataPoints";
import { DetailField, DetailFieldAlign } from "@/dossier";
import { mmsiCountry } from "@/panes/dossier/DossierAtoms";
import { navStatusMeta, setDrift } from "../shipMeta";
import { NO_VALUE } from "@shared/text";
import { ShipDataLabel, type ShipData } from "../types";
import {
  formatShipCourse,
  formatShipDrift,
  formatShipHeading,
  formatShipSpeed,
} from "../formatters";

export function ShipDetailSummary({ item }: { readonly item: DataPoint }) {
  const d = (item.data as ShipData) ?? {};
  const nav = navStatusMeta(d.navStatus);
  const country = d.mmsi ? mmsiCountry(d.mmsi) : null;
  const kicker = [
    "AIS VESSEL",
    d.vesselType && d.vesselType !== ShipDataLabel.Unknown
      ? d.vesselType
      : null,
    country,
  ]
    .filter(Boolean)
    .join(" · ");
  const drift = setDrift(d.heading, d.cog);
  const headingText = formatShipHeading(d.heading, NO_VALUE);
  const driftText = formatShipDrift(drift, NO_VALUE);

  return (
    <div className="pt-2.5 border-t border-sig-border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--sig-text-md) font-bold text-sig-bright leading-snug truncate">
            {d.name || `MMSI ${d.mmsi}`}
          </div>
          <div className="text-(length:--sig-text-xs) text-sig-dim mt-1 truncate">{kicker}</div>
        </div>
        <span className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded border border-sig-ships text-sig-ships whitespace-nowrap">
          {nav.alert ? "⚠ " : ""}{nav.label}
        </span>
      </div>

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <DetailField
            label="SPEED"
            value={formatShipSpeed(d.sog, NO_VALUE)}
          />
          <DetailField
            label="HEADING"
            value={headingText}
            align={DetailFieldAlign.Right}
          />
        </div>
        <div className="flex justify-between gap-4">
          <DetailField
            label="COURSE"
            value={formatShipCourse(d.cog, NO_VALUE)}
          />
          <DetailField
            label="DRIFT"
            value={driftText}
            align={DetailFieldAlign.Right}
          />
        </div>
        <div className="flex justify-between gap-4">
          <DetailField label="DESTINATION" value={d.destination || NO_VALUE} />
          <DetailField label="ETA" value={d.eta || NO_VALUE} align={DetailFieldAlign.Right} />
        </div>
      </div>
    </div>
  );
}
