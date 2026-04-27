import { Flame } from "lucide-react";
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

export function FireDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = (item.data as Record<string, any>) ?? {};
  const {
    frp,
    brightness,
    brightT31,
    confidence,
    satellite,
    instrument,
    daynight,
    scan,
    track,
    acqDate,
    acqTime,
  } = d;
  const closeBtnRef = useDossierFocus(item.id);
  const title = `Fire Hotspot${frp ? ` — FRP ${(frp as number).toFixed(1)} MW` : ""}`;

  return (
    <div className="h-full flex flex-col">
      <DossierToolbar
        icon={Flame}
        title={title}
        subtitle="FIRE HOTSPOT"
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="flex-1 overflow-y-auto sigint-scroll">
        <div className="p-3 space-y-3">
          <Section title="THERMAL">
            {frp != null && (frp as number) > 0 && (
              <Row label="FRP" value={`${(frp as number).toFixed(1)} MW`} />
            )}
            {brightness != null && (brightness as number) > 0 && (
              <Row
                label="BRIGHTNESS"
                value={`${(brightness as number).toFixed(1)} K`}
              />
            )}
            {brightT31 != null && (brightT31 as number) > 0 && (
              <Row
                label="BRIGHT T31"
                value={`${(brightT31 as number).toFixed(1)} K`}
              />
            )}
            {confidence && (
              <Row
                label="CONFIDENCE"
                value={(confidence as string).toUpperCase()}
              />
            )}
          </Section>
          <Section title="DETECTION">
            {satellite && <Row label="SATELLITE" value={satellite as string} />}
            {instrument && (
              <Row label="INSTRUMENT" value={instrument as string} />
            )}
            {daynight && (
              <Row
                label="TIME"
                value={daynight === "D" ? "DAYTIME" : "NIGHTTIME"}
              />
            )}
            {scan != null && track != null && (
              <Row
                label="PIXEL"
                value={`${(scan as number).toFixed(1)} × ${(track as number).toFixed(1)} km`}
              />
            )}
            {acqDate && (
              <Row
                label="DATE"
                value={`${acqDate}${acqTime ? ` ${(acqTime as string).slice(0, 2)}:${(acqTime as string).slice(2)}Z` : ""}`}
              />
            )}
          </Section>
          <Section title="POSITION">
            <div className="text-sm font-mono text-sig-dim">
              {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
              {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
            </div>
          </Section>
          <Section title="INTEL LINKS">
            <LinkRow
              label="NASA FIRMS Map"
              href={`https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${item.lon},${item.lat},10z`}
            />
            <LinkRow
              label="Google Maps (Satellite)"
              href={`https://www.google.com/maps/@${item.lat},${item.lon},14z/data=!3m1!1e1`}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
