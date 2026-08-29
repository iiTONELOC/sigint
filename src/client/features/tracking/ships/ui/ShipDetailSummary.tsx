import { DetailField } from "@/dossier";
import { PanelSide } from "@/layout-mode";
import { NO_VALUE } from "@shared/text";
import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { shipPresentation } from "../formatters/presentation";

export function ShipDetailSummary({ item }: { readonly item: DataPoint }) {
  if (item.type !== Domain.Ships) return null;
  const presentation = shipPresentation(item.data, `MMSI ${item.data.mmsi}`, NO_VALUE);
  const kicker = ["AIS VESSEL", presentation.description]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="pt-2.5 border-t border-sig-border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--sig-text-md) font-bold text-sig-bright leading-snug truncate">
            {presentation.name}
          </div>
          <div className="text-(length:--sig-text-xs) text-sig-dim mt-1 truncate">{kicker}</div>
        </div>
        <span className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded border border-sig-ships text-sig-ships whitespace-nowrap">
          {presentation.navigation.alert ? "⚠ " : ""}
          {presentation.navigation.compactLabel}
        </span>
      </div>

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <DetailField
            label="SPEED"
            value={presentation.speedText}
          />
          <DetailField
            label="HEADING"
            value={presentation.headingText}
            align={PanelSide.Right}
          />
        </div>
        <div className="flex justify-between gap-4">
          <DetailField
            label="COURSE"
            value={presentation.courseText}
          />
          <DetailField
            label="DRIFT"
            value={presentation.driftText}
            align={PanelSide.Right}
          />
        </div>
        <div className="flex justify-between gap-4">
          <DetailField label="DESTINATION" value={presentation.destinationText} />
          <DetailField label="ETA" value={presentation.etaText} align={PanelSide.Right} />
        </div>
      </div>
    </div>
  );
}
