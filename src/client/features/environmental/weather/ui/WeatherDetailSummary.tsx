import type { DataPoint } from "@/features/base/dataPoints";
import { severityMeta } from "../severity";
import { unwrapNwsText } from "../text";

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

function fmtExpires(expires: string | undefined): string {
  if (!expires) return "—";
  const ms = new Date(expires).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "—";
  if (ms <= 0) return "expired";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

export function WeatherDetailSummary({ item }: { readonly item: DataPoint }) {
  const d = (item as { data?: Record<string, unknown> }).data ?? {};
  const str = (k: string): string | undefined => {
    const v = d[k];
    return typeof v === "string" ? v : undefined;
  };
  const event = str("event") ?? "Weather Alert";
  const meta = severityMeta(str("severity"));
  const urgency = str("urgency");
  const areaDesc = str("areaDesc");
  const areaCount = areaDesc ? areaDesc.split(";").filter((a) => a.trim()).length : 0;
  const instruction = str("instruction");

  return (
    <div className="pt-2.5 border-t border-sig-border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--sig-text-md) font-bold text-sig-bright leading-snug">{event}</div>
          <div className="text-(length:--sig-text-xs) text-sig-dim mt-1 truncate">
            WEATHER ALERT{urgency ? ` · ${urgency}` : ""}
          </div>
        </div>
        <span
          className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 border whitespace-nowrap"
          style={{ color: meta.ink, borderColor: meta.ink }}
        >
          {meta.label}
        </span>
      </div>

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <Field label="EXPIRES" value={fmtExpires(str("expires"))} />
          <Field label="CERTAINTY" value={str("certainty") ?? "—"} align="right" />
        </div>
        <div className="flex justify-between gap-4">
          <Field label="RESPONSE" value={str("response") ?? "—"} />
          <Field label="AREAS" value={areaCount > 0 ? String(areaCount) : "—"} align="right" />
        </div>
      </div>

      {instruction && (
        <div className="mt-3 pt-3 border-t border-sig-border/50">
          <div className="text-(length:--sig-text-xs) tracking-widest font-semibold mb-1" style={{ color: meta.ink }}>
            PROTECTIVE ACTION
          </div>
          <div className="text-(length:--sig-text-xs) text-sig-bright leading-relaxed line-clamp-5 whitespace-pre-line">
            {unwrapNwsText(instruction)}
          </div>
        </div>
      )}
    </div>
  );
}
