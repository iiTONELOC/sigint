import { DetailField, DetailFieldAlign } from "@/dossier";
import type { DataPoint } from "@/features/base/dataPoints";
import { NO_VALUE } from "@shared/text";
import type { EventData } from "../types";

enum EventDetailClassName {
  Category = "shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded border border-current whitespace-nowrap uppercase text-[#d6448f]",
}

function goldsteinLabel(gs: number): string {
  if (gs <= -5) return "major conflict";
  if (gs < 0) return "conflict";
  if (gs === 0) return "neutral";
  if (gs <= 5) return "cooperation";
  return "major cooperation";
}

export function EventDetailSummary({ item }: { readonly item: DataPoint }) {
  const d = (item.data as EventData) ?? {};
  const headline = d.headline || "Intel event";
  const actors = [d.actor1, d.actor2].filter(Boolean).join(" → ");

  return (
    <div className="pt-2.5 border-t border-sig-border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--sig-text-sm) font-bold text-sig-bright leading-snug line-clamp-2">{headline}</div>
          <div className="text-(length:--sig-text-xs) text-sig-dim mt-1 truncate">
            INTEL EVENT{actors ? ` · ${actors}` : ""}
          </div>
        </div>
        {d.category && (
          <span
            className={EventDetailClassName.Category}
          >
            {d.category}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <DetailField label="IMPACT" value={d.goldstein == null ? NO_VALUE : `${d.goldstein.toFixed(1)} · ${goldsteinLabel(d.goldstein)}`} />
          <DetailField label="TONE" value={d.tone == null ? NO_VALUE : d.tone.toFixed(1)} align={DetailFieldAlign.Right} />
        </div>
        <div className="flex justify-between gap-4">
          <DetailField label="MENTIONS" value={d.mentions != null && d.mentions > 0 ? String(d.mentions) : NO_VALUE} />
          <DetailField label="SOURCE" value={d.source ?? NO_VALUE} align={DetailFieldAlign.Right} />
        </div>
      </div>
    </div>
  );
}
