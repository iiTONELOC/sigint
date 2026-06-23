import type { DataPoint } from "@/features/base/dataPoints";
import type { EventData } from "../types";

const ACCENT = "#d6448f";

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
            className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap uppercase"
            style={{ color: ACCENT, borderColor: ACCENT }}
          >
            {d.category}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <Field label="IMPACT" value={d.goldstein == null ? "—" : `${d.goldstein.toFixed(1)} · ${goldsteinLabel(d.goldstein)}`} />
          <Field label="TONE" value={d.tone == null ? "—" : d.tone.toFixed(1)} align="right" />
        </div>
        <div className="flex justify-between gap-4">
          <Field label="MENTIONS" value={d.mentions != null && d.mentions > 0 ? String(d.mentions) : "—"} />
          <Field label="SOURCE" value={d.source ?? "—"} align="right" />
        </div>
      </div>
    </div>
  );
}
