import { Wind } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import type { CycloneData } from "../types";
import { useCycloneDossier } from "../hooks/useCycloneDossier";
import {
  DossierToolbar,
  Section,
  Row,
  LinkRow,
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

type Props = {
  readonly item: DataPoint & { type: "cyclones"; data: CycloneData };
  readonly isolateMode: null | "solo" | "focus";
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

export function CycloneDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = item.data;
  const category = CATEGORY_LABEL[d.classification] ?? d.classification;
  const movement =
    d.movementDir != null && d.movementSpeedKt != null
      ? `${d.movementDir}° at ${d.movementSpeedKt} kn`
      : null;
  const closeBtnRef = useDossierFocus(item.id);
  const badge = d.saffirSimpson > 0 ? `CAT ${d.saffirSimpson}` : null;
  const { dossier, loading } = useCycloneDossier(d.stormId);

  return (
    <div className="h-full flex flex-col">
      <DossierToolbar
        icon={Wind}
        title={d.name}
        subtitle={category}
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
          <Section title="IDENTITY">
            <Row label="STORM ID" value={d.stormId} />
            <Row label="BASIN" value={d.basin} />
            <Row label="ADVISORY" value={d.advisoryNumber} />
            <Row
              label="LAST UPDATE"
              value={new Date(d.lastUpdate).toLocaleString()}
            />
          </Section>

          <Section title="INTENSITY">
            <Row
              label="WINDS"
              value={`${d.maxWindKt} kn (${Math.round(d.maxWindKt * 1.15078)} mph)`}
            />
            {d.minPressureMb != null && (
              <Row label="PRESSURE" value={`${d.minPressureMb} mb`} />
            )}
            <Row label="CLASS" value={category} />
          </Section>

          {movement && (
            <Section title="MOVEMENT">
              <Row label="MOVING" value={movement} />
            </Section>
          )}

          {d.forecast.length > 0 && (
            <Section title="FORECAST TRACK">
              {d.forecast.map((f) => (
                <Row
                  key={f.fcstHour}
                  label={`+${f.fcstHour}h`}
                  value={`${f.maxWindKt}kn ${f.category} — ${f.lat.toFixed(1)},${f.lon.toFixed(1)}`}
                />
              ))}
            </Section>
          )}

          <Section title="ADVISORY">
            {loading && !dossier?.advisory ? (
              <div
                className="text-xs text-sig-dim"
                aria-live="polite"
              >
                Loading…
              </div>
            ) : null}
            {dossier?.advisory ? (
              <pre className="text-xs text-sig-text whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                {dossier.advisory.body}
              </pre>
            ) : null}
          </Section>

          <Section title="DISCUSSION">
            {loading && !dossier?.discussion ? (
              <div
                className="text-xs text-sig-dim"
                aria-live="polite"
              >
                Loading…
              </div>
            ) : null}
            {dossier?.discussion ? (
              <pre className="text-xs text-sig-text whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                {dossier.discussion.body}
              </pre>
            ) : null}
          </Section>

          <Section title="POSITION">
            <div className="text-sm font-mono text-sig-dim">
              {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
              {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
            </div>
          </Section>

          <Section title="INTEL LINKS">
            <LinkRow
              label="NHC Storm Page"
              href={`https://www.nhc.noaa.gov/graphics_${d.basin.toLowerCase()}${d.stormId.slice(2, 4)}.shtml`}
            />
            <LinkRow
              label="Tropical Tidbits"
              href="https://www.tropicaltidbits.com/storminfo/"
            />
            <LinkRow
              label="NRL Tropical Cyclones"
              href="https://www.nrlmry.navy.mil/TC.html"
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
