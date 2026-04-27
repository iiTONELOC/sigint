import { Zap } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  DossierToolbar,
  Section,
  Row,
  LinkRow,
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

export function EventDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = (item.data as Record<string, any>) ?? {};
  const {
    headline,
    category,
    severity,
    tone,
    source,
    sourceCountry,
    locationName,
    url,
  } = d;
  const toneLabel =
    tone != null
      ? tone <= -15
        ? "VERY NEGATIVE"
        : tone <= -5
          ? "NEGATIVE"
          : tone <= -1
            ? "SLIGHTLY NEGATIVE"
            : tone <= 1
              ? "NEUTRAL"
              : tone <= 5
                ? "SLIGHTLY POSITIVE"
                : "POSITIVE"
      : null;
  const closeBtnRef = useDossierFocus(item.id);

  return (
    <div className="h-full flex flex-col">
      <DossierToolbar
        icon={Zap}
        title={headline || "Unknown event"}
        subtitle="GDELT EVENT"
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="flex-1 overflow-y-auto sigint-scroll">
        <div className="p-3 space-y-3">
          <Section title="EVENT">
            {category && <Row label="TYPE" value={category} />}
            {severity != null && (
              <Row
                label="SEVERITY"
                value={
                  "█".repeat(severity) + "░".repeat(5 - severity)
                }
              />
            )}
            {tone != null && (
              <Row label="TONE" value={`${tone.toFixed(1)} ${toneLabel}`} />
            )}
            {source && <Row label="OUTLET" value={source} />}
            {sourceCountry && <Row label="ORIGIN" value={sourceCountry} />}
            {locationName && <Row label="LOCATION" value={locationName} />}
          </Section>
          <Section title="POSITION">
            <div className="text-sm font-mono text-sig-dim">
              {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
              {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
            </div>
          </Section>
          {url && (
            <Section title="SOURCE">
              <LinkRow label="Read article" href={url} />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
