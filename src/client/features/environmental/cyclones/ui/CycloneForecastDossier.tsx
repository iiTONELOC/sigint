import { Wind } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import type { CycloneForecastPointData } from "../types";
import {
  DossierToolbar,
  Section,
  Row,
  useDossierFocus,
} from "@/panes/dossier/DossierAtoms";

// Dossier for one forecast-track point — shows that point's own projected data.

const CATEGORY_LABEL: Record<string, string> = {
  TD: "Tropical Depression",
  TS: "Tropical Storm",
  HU1: "Hurricane Cat 1",
  HU2: "Hurricane Cat 2",
  HU3: "Hurricane Cat 3 (major)",
  HU4: "Hurricane Cat 4 (major)",
  HU5: "Hurricane Cat 5 (major)",
  STD: "Subtropical Depression",
  STS: "Subtropical Storm",
  PT: "Post-Tropical",
};

const KT_TO_MPH = 1.15078;
const NM_TO_KM = 1.852;

type Props = {
  readonly item: DataPoint & {
    type: "cyclones-forecast";
    data: CycloneForecastPointData;
  };
  readonly isolateMode: null | "solo" | "focus";
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
  const badge = d.saffirSimpson > 0 ? `CAT ${d.saffirSimpson}` : null;
  const mph = Math.round(d.maxWindKt * KT_TO_MPH);
  const errKm = Math.round(d.errorRadiusNm * NM_TO_KM);

  return (
    <div className="h-full flex flex-col">
      <DossierToolbar
        icon={Wind}
        title={`${d.parentName} · +${d.fcstHour}h`}
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
            <Row label="LEAD TIME" value={`+${d.fcstHour}h`} />
            <Row label="VALID" value={d.validTime || "—"} />
          </Section>

          <Section title="INTENSITY">
            <Row label="WINDS" value={`${d.maxWindKt} kn (${mph} mph)`} />
            {d.minPressureMb != null && (
              <Row label="PRESSURE" value={`${d.minPressureMb} mb`} />
            )}
            <Row label="CLASS" value={category} />
          </Section>

          <Section title="POSITION">
            <div className="text-sm font-mono text-sig-bright">
              {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
              {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
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
