import {
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_MINUTE,
} from "@shared/time";
import { DetailField, DetailFieldAlign } from "@/dossier";
import { EMPTY_TEXT, NO_VALUE } from "@shared/text";
import type { WeatherPoint } from "../types";
import {
  WeatherSeverity,
  weatherSeverityLabel,
} from "../severity";
import { unwrapNwsText, weatherAreas } from "../text";
import { WeatherCopy } from "../formatters";

enum WeatherDetailText {
  Expired = "expired",
}

enum WeatherDetailClassName {
  Root = "pt-2.5 border-t border-sig-border",
  Header = "flex items-start justify-between gap-2",
  HeaderText = "min-w-0",
  Event = "text-(length:--sig-text-md) font-bold text-sig-bright leading-snug",
  Eyebrow = "text-(length:--sig-text-xs) text-sig-dim mt-1 truncate",
  Badge = "shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 border border-current whitespace-nowrap",
  Facts = "flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50",
  FactRow = "flex justify-between gap-4",
  Instruction = "mt-3 pt-3 border-t border-sig-border/50",
  InstructionLabel = "text-(length:--sig-text-xs) tracking-widest font-semibold mb-1",
  InstructionBody = "text-(length:--sig-text-xs) text-sig-bright leading-relaxed line-clamp-5 whitespace-pre-line",
}

enum WeatherSeverityClassName {
  Slate = "text-[#6b7a8d]",
  Blue = "text-[#5c7cfa]",
  Violet = "text-[#9775fa]",
  Magenta = "text-[#cc5de8]",
  Pink = "text-[#e64980]",
}

function weatherSeverityClassName(
  severity: WeatherSeverity,
): WeatherSeverityClassName {
  switch (severity) {
    case WeatherSeverity.Minor:
      return WeatherSeverityClassName.Blue;
    case WeatherSeverity.Moderate:
      return WeatherSeverityClassName.Violet;
    case WeatherSeverity.Severe:
      return WeatherSeverityClassName.Magenta;
    case WeatherSeverity.Extreme:
      return WeatherSeverityClassName.Pink;
    default:
      return WeatherSeverityClassName.Slate;
  }
}

function fmtExpires(expires: string | undefined): string {
  if (!expires) return NO_VALUE;
  const remaining = new Date(expires).getTime() - Date.now();
  if (!Number.isFinite(remaining)) return NO_VALUE;
  if (remaining <= 0) return WeatherDetailText.Expired;

  const minutes = Math.round(remaining / MS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `in ${minutes}m`;

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const spareMinutes = minutes % MINUTES_PER_HOUR;
  if (hours < HOURS_PER_DAY) {
    return spareMinutes > 0 ? `in ${hours}h ${spareMinutes}m` : `in ${hours}h`;
  }
  return `in ${Math.floor(hours / HOURS_PER_DAY)}d`;
}

export function WeatherDetailSummary({
  item,
}: {
  readonly item: WeatherPoint;
}) {
  const data = item.data;
  const severityClassName = weatherSeverityClassName(data.severity);
  const areaCount = weatherAreas(data.areaDesc).length;

  return (
    <div className={WeatherDetailClassName.Root}>
      <div className={WeatherDetailClassName.Header}>
        <div className={WeatherDetailClassName.HeaderText}>
          <div className={WeatherDetailClassName.Event}>
            {data.event ?? WeatherCopy.Alert}
          </div>
          <div className={WeatherDetailClassName.Eyebrow}>
            WEATHER ALERT
            {data.urgency ? ` · ${data.urgency}` : EMPTY_TEXT}
          </div>
        </div>
        <span
          className={`${WeatherDetailClassName.Badge} ${severityClassName}`}
        >
          {weatherSeverityLabel(data.severity)}
        </span>
      </div>

      <div className={WeatherDetailClassName.Facts}>
        <div className={WeatherDetailClassName.FactRow}>
          <DetailField label="EXPIRES" value={fmtExpires(data.expires)} />
          <DetailField
            label="CERTAINTY"
            value={data.certainty ?? NO_VALUE}
            align={DetailFieldAlign.Right}
          />
        </div>
        <div className={WeatherDetailClassName.FactRow}>
          <DetailField label="RESPONSE" value={data.response ?? NO_VALUE} />
          <DetailField
            label="AREAS"
            value={areaCount > 0 ? String(areaCount) : NO_VALUE}
            align={DetailFieldAlign.Right}
          />
        </div>
      </div>

      {data.instruction && (
        <div className={WeatherDetailClassName.Instruction}>
          <div className={`${WeatherDetailClassName.InstructionLabel} ${severityClassName}`}>
            PROTECTIVE ACTION
          </div>
          <div className={WeatherDetailClassName.InstructionBody}>
            {unwrapNwsText(data.instruction)}
          </div>
        </div>
      )}
    </div>
  );
}
