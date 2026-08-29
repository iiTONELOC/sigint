import {
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_MINUTE,
} from "@shared/time";
import { DetailField } from "@/dossier";
import { PanelSide } from "@/layout-mode";
import { EMPTY_TEXT, NO_VALUE } from "@shared/text";
import type { CSSProperties } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { unwrapNwsText, weatherAreas } from "../text";
import { WeatherCopy, weatherSeverityLabel } from "../formatters/presentation";
import { weatherSeverityInk } from "../render";

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
  Severity = "text-(--dossier-accent)",
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
  readonly item: DataPoint;
}) {
  if (item.type !== Domain.Weather) return null;
  const data = item.data;
  const areaCount = weatherAreas(data.areaDesc).length;

  return (
    <div
      className={WeatherDetailClassName.Root}
      style={{ "--dossier-accent": weatherSeverityInk(data.severity) } as CSSProperties}
    >
      <div className={WeatherDetailClassName.Header}>
        <div className={WeatherDetailClassName.HeaderText}>
          <div className={WeatherDetailClassName.Event}>
            {data.event ?? WeatherCopy.Alert}
          </div>
          <div className={WeatherDetailClassName.Eyebrow}>
            {WeatherCopy.Alert.toUpperCase()}
            {data.urgency ? ` · ${data.urgency}` : EMPTY_TEXT}
          </div>
        </div>
        <span
          className={`${WeatherDetailClassName.Badge} ${WeatherDetailClassName.Severity}`}
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
            align={PanelSide.Right}
          />
        </div>
        <div className={WeatherDetailClassName.FactRow}>
          <DetailField label="RESPONSE" value={data.response ?? NO_VALUE} />
          <DetailField
            label="AREAS"
            value={areaCount > 0 ? String(areaCount) : NO_VALUE}
            align={PanelSide.Right}
          />
        </div>
      </div>

      {data.instruction && (
        <div className={WeatherDetailClassName.Instruction}>
          <div className={`${WeatherDetailClassName.InstructionLabel} ${WeatherDetailClassName.Severity}`}>
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
