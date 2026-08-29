import { DossierIdentityCard, DossierMetric } from "@/dossier";
import { AgeStyle, relativeAge } from "@/time";
import type { WeatherSeverity } from "@shared/domain/weather";
import { weatherAreas } from "../text";
import { WeatherCopy, weatherSeverityLabel } from "../formatters/presentation";

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
  const age = timestamp
    ? relativeAge(new Date(timestamp).getTime(), AgeStyle.Verbose)
    : null;
  const areaCount = weatherAreas(areaDesc).length;
  const source = senderName || WeatherCopy.DefaultSender;

  return (
    <DossierIdentityCard
      age={age}
      source={source}
      truncateSource
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-(length:--sig-text-xs) tracking-widest text-(--dossier-accent) font-semibold">
            {WeatherCopy.Alert.toUpperCase()}
            {urgency ? ` · ${urgency.toUpperCase()}` : ""}
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
        {certainty && (
          <DossierMetric label="CERTAINTY" value={certainty} />
        )}
        {response && <DossierMetric label="RESPONSE" value={response} />}
        {areaCount > 0 && (
          <DossierMetric label="AREAS" value={String(areaCount)} />
        )}
      </div>
    </DossierIdentityCard>
  );
}
