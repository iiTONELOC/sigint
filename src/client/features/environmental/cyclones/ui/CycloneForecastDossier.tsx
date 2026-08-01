import type { SelectedIsolateMode } from "@/workers/render/protocol";
import { Wind } from "lucide-react";
import { Domain } from "@shared/domain/identity";
import { NO_VALUE } from "@shared/text";
import type { DataPoint } from "@/features/base/dataPoints";
import { formatLat, formatLon } from "@/lib/format/geoFormat";
import { formatKtMph, nmToKm } from "@/measurements";
import type { CycloneForecastPointData } from "../types";
import {
  DossierToolbar,
  Section,
  Row,
  useDossierFocus,
} from "@/panes/dossier/DossierAtoms";
import { CATEGORY_LABEL } from "../classification";
import { leadTime } from "../forecastDefinition";
import { SaffirSimpson } from "../types";

type Props = {
  readonly item: DataPoint & {
    type: Domain.CyclonesForecast;
    data: CycloneForecastPointData;
  };
  readonly isolateMode: SelectedIsolateMode;
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

export function CycloneForecastDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = item.data;
  const category = CATEGORY_LABEL[d.category] ?? d.category;
  const closeBtnRef = useDossierFocus(item.id);
  const badge = d.saffirSimpson > SaffirSimpson.None
    ? `CAT ${d.saffirSimpson}`
    : null;
  const errKm = nmToKm(d.errorRadiusNm);

  return (
    <div className="h-full flex flex-col">
      <DossierToolbar
        icon={Wind}
        title={`${d.parentName} · ${leadTime(d.fcstHour)}`}
        subtitle={`${category} (forecast)`}
        badge={badge}
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="flex-1 overflow-y-auto sigint-scroll">
        <div className="p-3 space-y-3">
          <Section title="FORECAST">
            <Row label="STORM" value={d.parentName} />
            <Row label="BASIN" value={d.parentBasin} />
            <Row label="LEAD TIME" value={leadTime(d.fcstHour)} />
            <Row label="VALID" value={d.validTime || NO_VALUE} />
          </Section>

          <Section title="INTENSITY">
            <Row label="WINDS" value={formatKtMph(d.maxWindKt)} />
            {d.minPressureMb != null && (
              <Row label="PRESSURE" value={`${d.minPressureMb} mb`} />
            )}
            <Row label="CLASS" value={category} />
          </Section>

          <Section title="POSITION">
            <div className="text-(length:--sig-text-sm) font-mono text-sig-bright">
              {formatLat(item.lat)}, {formatLon(item.lon)}
            </div>
          </Section>

          <Section title="UNCERTAINTY">
            <Row
              label="TRACK ERROR"
              value={`${d.errorRadiusNm} nm (${errKm} km)`}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
