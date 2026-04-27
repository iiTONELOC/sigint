import { Wind, ArrowUpRight } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import type { CycloneForecastPointData } from "../types";
import {
  DossierToolbar,
  Section,
  Row,
  useDossierFocus,
} from "@/panes/dossier/DossierAtoms";

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

const NM_TO_KM = 1.852;
const KT_TO_MPH = 1.15078;

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
  /** Open the parent storm's full dossier. Fired by the JUMP TO STORM
   *  button — caller resolves the parent DataPoint by stormId and
   *  forwards it to the same setSelected action the click pipeline
   *  uses. */
  readonly onJumpToStorm: (parentStormId: string) => void;
};

export function CycloneForecastDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
  onJumpToStorm,
}: Props) {
  const d = item.data;
  const closeBtnRef = useDossierFocus(item.id);
  const category = CATEGORY_LABEL[d.category] ?? d.category;
  const errorRadiusKm = Math.round(d.errorRadiusNm * NM_TO_KM);
  const windsMph = Math.round(d.maxWindKt * KT_TO_MPH);

  return (
    <div className="h-full flex flex-col">
      <DossierToolbar
        icon={Wind}
        title={d.parentName}
        subtitle={`+${d.fcstHour}h forecast`}
        badge={`+${d.fcstHour}h`}
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
            <Row label="STORM" value={d.parentName} />
            <Row label="STORM ID" value={d.parentStormId} />
            <Row label="BASIN" value={d.parentBasin} />
            <Row label="FORECAST HOUR" value={`+${d.fcstHour}h`} />
            <Row
              label="VALID AT"
              value={new Date(d.validTime).toLocaleString()}
            />
          </Section>

          <Section title="INTENSITY">
            <Row
              label="WINDS"
              value={`${d.maxWindKt} kn (${windsMph} mph)`}
            />
            {d.minPressureMb != null && (
              <Row label="PRESSURE" value={`${d.minPressureMb} mb`} />
            )}
            <Row label="CLASS" value={category} />
          </Section>

          <Section title="POSITION">
            <div className="text-sm font-mono text-sig-dim">
              {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
              {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
            </div>
          </Section>

          <Section title="UNCERTAINTY">
            <Row
              label="TRACK ERROR"
              value={`${d.errorRadiusNm} nm (${errorRadiusKm} km)`}
            />
          </Section>

          <Section title="PARENT STORM">
            <button
              type="button"
              onClick={() => onJumpToStorm(d.parentStormId)}
              aria-label={`Open dossier for parent storm ${d.parentName}`}
              className="w-full flex items-center justify-between text-sm text-sig-accent hover:text-sig-bright transition-colors py-1 px-2 rounded border border-sig-grid/50 hover:border-sig-accent/40"
            >
              <span>JUMP TO STORM</span>
              <ArrowUpRight className="w-3 h-3 shrink-0" aria-hidden="true" />
            </button>
          </Section>
        </div>
      </div>
    </div>
  );
}
