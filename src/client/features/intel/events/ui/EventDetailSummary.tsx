import { DetailField } from "@/dossier";
import { PanelSide } from "@/layout-mode";
import type { DataPoint } from "@/features/base/dataPoints";
import { NO_VALUE } from "@shared/text";
import { EventCopy, EventFieldLabel } from "../formatters/copy";
import type { EventData } from "@shared/domain/events";
import { Domain } from "@shared/domain/identity";
import { eventImpactLabel } from "../utils/tone";

export function EventDetailSummary({ item }: { readonly item: DataPoint }) {
  const d: EventData = item.type === Domain.Events ? item.data : {};
  const headline = d.headline || EventCopy.DefaultTitle;
  const actors = [d.actor1, d.actor2].filter(Boolean).join(" → ");

  return (
    <div className="pt-2.5 border-t border-sig-border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--sig-text-sm) font-bold text-sig-bright leading-snug line-clamp-2">{headline}</div>
          <div className="text-(length:--sig-text-xs) text-sig-dim mt-1 truncate">
            {EventCopy.Kind}{actors ? ` · ${actors}` : ""}
          </div>
        </div>
        {d.category && (
          <span
            className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded border border-current whitespace-nowrap uppercase text-sig-events"
          >
            {d.category}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <DetailField
            label={EventFieldLabel.Impact.toUpperCase()}
            value={d.goldstein == null ? NO_VALUE : `${d.goldstein.toFixed(1)} · ${eventImpactLabel(d.goldstein)}`}
          />
          <DetailField
            label={EventFieldLabel.Tone.toUpperCase()}
            value={d.tone == null ? NO_VALUE : d.tone.toFixed(1)}
            align={PanelSide.Right}
          />
        </div>
        <div className="flex justify-between gap-4">
          <DetailField
            label={EventFieldLabel.Mentions.toUpperCase()}
            value={d.mentions != null && d.mentions > 0 ? String(d.mentions) : NO_VALUE}
          />
          <DetailField
            label={EventFieldLabel.Source.toUpperCase()}
            value={d.source ?? NO_VALUE}
            align={PanelSide.Right}
          />
        </div>
      </div>
    </div>
  );
}
