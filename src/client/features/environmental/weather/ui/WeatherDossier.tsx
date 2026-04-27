import { CloudAlert } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  DossierToolbar,
  Section,
  Row,
  useDossierFocus,
} from "@/panes/dossier/DossierAtoms";

type Props = {
  readonly item: DataPoint;
  readonly isolateMode: null | "solo" | "focus";
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

export function WeatherDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = (item.data as Record<string, any>) ?? {};
  const {
    event,
    severity,
    urgency,
    certainty,
    headline,
    description,
    instruction,
    senderName,
    areaDesc,
    onset,
    expires,
    category,
    response,
  } = d;
  const closeBtnRef = useDossierFocus(item.id);

  return (
    <div className="h-full flex flex-col">
      <DossierToolbar
        icon={CloudAlert}
        title={(event as string) || "Weather Alert"}
        subtitle="WEATHER ALERT"
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="flex-1 overflow-y-auto sigint-scroll">
        <div className="p-3 space-y-3">
          {headline && (
            <div className="text-sig-text text-sm leading-snug">
              {headline as string}
            </div>
          )}
          <Section title="ALERT">
            {severity && (
              <Row
                label="SEVERITY"
                value={(severity as string).toUpperCase()}
              />
            )}
            {urgency && <Row label="URGENCY" value={urgency as string} />}
            {certainty && (
              <Row label="CERTAINTY" value={certainty as string} />
            )}
            {category && <Row label="CATEGORY" value={category as string} />}
            {response && <Row label="RESPONSE" value={response as string} />}
          </Section>
          <Section title="AREA">
            {areaDesc && (
              <div className="text-sm text-sig-text leading-snug">
                {(areaDesc as string).split(";").slice(0, 5).join("; ")}
                {(areaDesc as string).split(";").length > 5 && "..."}
              </div>
            )}
            {senderName && <Row label="ISSUER" value={senderName as string} />}
          </Section>
          <Section title="TIMING">
            {onset && (
              <Row
                label="ONSET"
                value={new Date(onset as string).toLocaleString()}
              />
            )}
            {expires && (
              <Row
                label="EXPIRES"
                value={new Date(expires as string).toLocaleString()}
              />
            )}
          </Section>
          {description && (
            <Section title="DETAILS">
              <div className="text-xs text-sig-text/70 leading-relaxed max-h-40 overflow-y-auto sigint-scroll whitespace-pre-wrap">
                {(description as string).slice(0, 800)}
                {(description as string).length > 800 && "..."}
              </div>
            </Section>
          )}
          {instruction && (
            <Section title="INSTRUCTIONS">
              <div className="text-xs text-sig-text/70 leading-relaxed max-h-32 overflow-y-auto sigint-scroll whitespace-pre-wrap">
                {(instruction as string).slice(0, 500)}
                {(instruction as string).length > 500 && "..."}
              </div>
            </Section>
          )}
          <Section title="POSITION">
            <div className="text-sm font-mono text-sig-dim">
              {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
              {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
