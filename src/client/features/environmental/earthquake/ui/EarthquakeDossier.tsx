import { Activity } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import { formatLat, formatLon } from "@/lib/format/geoFormat";
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

export function EarthquakeDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = (item.data as Record<string, any>) ?? {};
  const { place, magnitude, depth, tsunamiAlert, felt, url, magType } = d;
  const closeBtnRef = useDossierFocus(item.id);

  return (
    <div className="h-full flex flex-col">
      <DossierToolbar
        icon={Activity}
        title={place || "Unknown location"}
        subtitle="SEISMIC"
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="flex-1 overflow-y-auto sigint-scroll">
        <div className="p-3 space-y-3">
          <Section title="SEISMIC">
            {magnitude != null && (
              <Row label="MAG" value={`${magnitude} ${magType ?? ""}`} />
            )}
            {depth != null && <Row label="DEPTH" value={`${depth} km`} />}
            {tsunamiAlert != null && (
              <Row label="TSUNAMI" value={tsunamiAlert ? "⚠ ALERT" : "No"} />
            )}
            {felt != null && felt > 0 && (
              <Row label="FELT BY" value={`${felt} reports`} />
            )}
          </Section>
          <Section title="POSITION">
            <div className="text-sm font-mono text-sig-dim">
              {formatLat(item.lat)}, {formatLon(item.lon)}
            </div>
          </Section>
          {url && (
            <Section title="SOURCE">
              <LinkRow label="USGS Detail" href={url} />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
