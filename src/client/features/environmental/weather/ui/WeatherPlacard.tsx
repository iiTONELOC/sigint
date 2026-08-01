import type { CSSProperties } from "react";
import { AgeStyle, relativeAge } from "@/time";
import {
  weatherSeverityInk,
  weatherSeverityLabel,
  type WeatherSeverity,
} from "../severity";
import { weatherAreas } from "../text";
import { WeatherCopy } from "../formatters";

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="leading-none">
      <div className="text-(length:--sig-text-md) text-sig-bright font-mono">{value}</div>
      <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim mt-1">{label}</div>
    </div>
  );
}

export function WeatherPlacard({
  event,
  severity,
  urgency,
  certainty,
  response,
  headline,
  senderName,
  areaDesc,
  timestamp,
}: {
  readonly event?: string;
  readonly severity: WeatherSeverity;
  readonly urgency?: string;
  readonly certainty?: string;
  readonly response?: string;
  readonly headline?: string;
  readonly senderName?: string;
  readonly areaDesc?: string;
  readonly timestamp?: string;
}) {
  const ink = weatherSeverityInk(severity);
  const age = timestamp
    ? relativeAge(new Date(timestamp).getTime(), AgeStyle.Verbose)
    : null;
  const areaCount = weatherAreas(areaDesc).length;

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-(--dossier-accent)/40 bg-sig-panel"
      style={{ "--dossier-accent": ink } as CSSProperties}
    >
      <div className="absolute inset-0 bg-(--dossier-accent)/6 pointer-events-none" />
      <div className="relative h-1 bg-(--dossier-accent)" />
      <div className="relative px-4 pt-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-(length:--sig-text-xs) tracking-widest text-(--dossier-accent) font-semibold">
              WEATHER ALERT{urgency ? ` · ${urgency.toUpperCase()}` : ""}
            </div>
            <div className="text-(length:--sig-text-lg) text-sig-bright font-bold tracking-wide leading-snug mt-1">
              {event || WeatherCopy.Alert}
            </div>
            {headline && (
              <div className="text-(length:--sig-text-sm) text-sig-text leading-snug mt-1">{headline}</div>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-center justify-center min-w-16 h-14 px-2.5 rounded-[12px] border-2 border-(--dossier-accent) text-(--dossier-accent)">
            <span className="text-(length:--sig-text-sm) font-bold leading-none whitespace-nowrap">{weatherSeverityLabel(severity)}</span>
            <span className="text-(length:--sig-text-xs) tracking-widest mt-0.5">SEV</span>
          </div>
        </div>

        <div className="flex items-end gap-5 flex-wrap mt-3">
          {certainty && <Fact label="CERTAINTY" value={certainty} />}
          {response && <Fact label="RESPONSE" value={response} />}
          {areaCount > 0 && <Fact label="AREAS" value={String(areaCount)} />}
        </div>
      </div>

      <div className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-(--dossier-accent)/20 bg-sig-bg/40 px-4 py-2 text-(length:--sig-text-xs) text-sig-dim">
        <span className="shrink-0 min-w-0 truncate">SOURCE <span className="text-sig-text">{senderName || WeatherCopy.DefaultSender}</span></span>
        {age && <span className="shrink-0">{age}</span>}
      </div>
    </div>
  );
}
