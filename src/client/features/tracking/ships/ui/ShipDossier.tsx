import { Ship } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  DossierToolbar,
  Section,
  Row,
  LinkRow,
  mmsiCountry,
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

export function ShipDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = (item.data as Record<string, any>) ?? {};
  const {
    name,
    mmsi,
    imo,
    callSign,
    shipTypeLabel,
    navStatusLabel,
    sog,
    cog,
    heading,
    destination,
    draught,
    length,
    width,
  } = d;
  const country = mmsi ? mmsiCountry(mmsi) : null;
  const closeBtnRef = useDossierFocus(item.id);

  return (
    <div className="h-full flex flex-col">
      <DossierToolbar
        icon={Ship}
        title={name || `MMSI ${mmsi}`}
        subtitle="AIS VESSEL"
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="flex-1 overflow-y-auto sigint-scroll">
        <div className="p-3 space-y-3">
          <Section title="IDENTITY">
            {mmsi && <Row label="MMSI" value={String(mmsi)} />}
            {imo && <Row label="IMO" value={String(imo)} />}
            {callSign && <Row label="CALL" value={callSign} />}
            {shipTypeLabel && shipTypeLabel !== "Unknown" && (
              <Row label="TYPE" value={shipTypeLabel} />
            )}
            {country && <Row label="FLAG" value={country} />}
            {destination && <Row label="DEST" value={destination} />}
          </Section>
          <Section title="TELEMETRY">
            {sog != null && <Row label="SOG" value={`${sog.toFixed(1)} kn`} />}
            {cog != null && <Row label="COG" value={`${cog.toFixed(0)}°`} />}
            {heading != null && heading !== 511 && (
              <Row label="HDG" value={`${heading}°`} />
            )}
            {navStatusLabel && navStatusLabel !== "Not defined" && (
              <Row label="NAV" value={navStatusLabel} />
            )}
          </Section>
          {(draught > 0 || length > 0 || width > 0) && (
            <Section title="DIMENSIONS">
              {length > 0 && <Row label="LEN" value={`${length}m`} />}
              {width > 0 && <Row label="BEAM" value={`${width}m`} />}
              {draught > 0 && <Row label="DRAFT" value={`${draught}m`} />}
            </Section>
          )}
          <Section title="POSITION">
            <div className="text-sm font-mono text-sig-dim">
              {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
              {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
            </div>
          </Section>
          <Section title="INTEL LINKS">
            {mmsi && (
              <LinkRow
                label="MarineTraffic"
                href={`https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`}
              />
            )}
            {mmsi && (
              <LinkRow
                label="VesselFinder"
                href={`https://www.vesselfinder.com/vessels?mmsi=${mmsi}`}
              />
            )}
            {imo && (
              <LinkRow
                label="Equasis"
                href={`https://www.equasis.org/EquasisWeb/restricted/ShipInfo?fs=Search&P_IMO=${imo}`}
              />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
