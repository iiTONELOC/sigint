import {
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_MINUTE,
} from "@shared/time";
import { EMPTY_TEXT, NO_VALUE } from "@shared/text";
import type { WeatherPoint } from "../types";
import { weatherSeverityInk, weatherSeverityLabel } from "../severity";
import { unwrapNwsText, weatherAreas } from "../text";

enum Align {
  Left = "left",
  Right = "right",
}

const EXPIRED_TEXT = "expired";

const SHRINKABLE = "min-w-0";

const CLASS = {
  field: SHRINKABLE,
  fieldRight: `${SHRINKABLE} text-right`,
  fieldLabel: "text-(length:--sig-text-xs) tracking-wide text-sig-dim",
  fieldValue: "text-(length:--sig-text-sm) text-sig-bright truncate",
  root: "pt-2.5 border-t border-sig-border",
  header: "flex items-start justify-between gap-2",
  headerText: SHRINKABLE,
  event: "text-(length:--sig-text-md) font-bold text-sig-bright leading-snug",
  eyebrow: "text-(length:--sig-text-xs) text-sig-dim mt-1 truncate",
  badge:
    "shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 border whitespace-nowrap",
  facts: "flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50",
  factRow: "flex justify-between gap-4",
  instruction: "mt-3 pt-3 border-t border-sig-border/50",
  instructionLabel:
    "text-(length:--sig-text-xs) tracking-widest font-semibold mb-1",
  instructionBody:
    "text-(length:--sig-text-xs) text-sig-bright leading-relaxed line-clamp-5 whitespace-pre-line",
};

function Field({
  label,
  value,
  align = Align.Left,
}: {
  readonly label: string;
  readonly value: string;
  readonly align?: Align;
}) {
  return (
    <div className={align === Align.Right ? CLASS.fieldRight : CLASS.field}>
      <div className={CLASS.fieldLabel}>{label}</div>
      <div className={CLASS.fieldValue}>{value}</div>
    </div>
  );
}

function fmtExpires(expires: string | undefined): string {
  if (!expires) return NO_VALUE;
  const remaining = new Date(expires).getTime() - Date.now();
  if (!Number.isFinite(remaining)) return NO_VALUE;
  if (remaining <= 0) return EXPIRED_TEXT;

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
  const ink = weatherSeverityInk(data.severity);
  const areaCount = weatherAreas(data.areaDesc).length;

  return (
    <div className={CLASS.root}>
      <div className={CLASS.header}>
        <div className={CLASS.headerText}>
          <div className={CLASS.event}>{data.event ?? "Weather Alert"}</div>
          <div className={CLASS.eyebrow}>
            WEATHER ALERT
            {data.urgency ? ` · ${data.urgency}` : EMPTY_TEXT}
          </div>
        </div>
        <span
          className={CLASS.badge}
          style={{ color: ink, borderColor: ink }}
        >
          {weatherSeverityLabel(data.severity)}
        </span>
      </div>

      <div className={CLASS.facts}>
        <div className={CLASS.factRow}>
          <Field label="EXPIRES" value={fmtExpires(data.expires)} />
          <Field
            label="CERTAINTY"
            value={data.certainty ?? NO_VALUE}
            align={Align.Right}
          />
        </div>
        <div className={CLASS.factRow}>
          <Field label="RESPONSE" value={data.response ?? NO_VALUE} />
          <Field
            label="AREAS"
            value={areaCount > 0 ? String(areaCount) : NO_VALUE}
            align={Align.Right}
          />
        </div>
      </div>

      {data.instruction && (
        <div className={CLASS.instruction}>
          <div className={CLASS.instructionLabel} style={{ color: ink }}>
            PROTECTIVE ACTION
          </div>
          <div className={CLASS.instructionBody}>
            {unwrapNwsText(data.instruction)}
          </div>
        </div>
      )}
    </div>
  );
}
