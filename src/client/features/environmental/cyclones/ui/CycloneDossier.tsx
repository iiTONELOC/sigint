import { useState } from "react";
import { Wind } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import { formatKtMph, formatKtShort } from "@/lib/units";
import type { CycloneData } from "../types";
import { useCycloneDossier } from "../hooks/useCycloneDossier";
import {
  DossierToolbar,
  Section,
  CollapsibleSection,
  Row,
  LinkRow,
  useDossierFocus,
} from "@/panes/dossier/DossierAtoms";
import { CycloneLayerToggles } from "./CycloneLayerToggles";
import { CycloneIntensityCurve } from "./CycloneIntensityCurve";
import { CycloneForecastMiniMap } from "./CycloneForecastMiniMap";
import { CATEGORY_LABEL } from "../classification";
import { useAssetsInCone } from "../hooks/useAssetsInCone";
import { useLandfallEta, landfallText } from "../hooks/useLandfallEta";
import { useCycloneModels } from "../hooks/useCycloneModels";
import { CycloneWindRadii } from "./CycloneWindRadii";

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
      ? `${d.movementDir}° at ${formatKtMph(d.movementSpeedKt)}`
      : null;
  const closeBtnRef = useDossierFocus(item.id);
  const badge = d.saffirSimpson > 0 ? `CAT ${d.saffirSimpson}` : null;
  const { dossier, loading } = useCycloneDossier(d.stormId);
  const coneAssets = useAssetsInCone(d.officialCone, d.advisoryNumber);
  const landfall = useLandfallEta(
    d.forecast,
    item.lat,
    item.lon,
    d.advisoryNumber,
  );
  const lf = landfall ? landfallText(landfall) : null;
  const [showModels, setShowModels] = useState(false);
  const models = useCycloneModels(d.stormId, showModels);

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
          <Section title="LAYERS">
            <CycloneLayerToggles />
          </Section>

          <Section title="IDENTITY">
            <Row label="STORM ID" value={d.stormId} />
            <Row label="BASIN" value={d.basin} />
            <Row label="ADVISORY" value={d.advisoryNumber} />
            <Row
              label="LAST UPDATE"
              value={new Date(d.lastUpdate).toLocaleString()}
            />
            <Row
              label="NEXT UPDATE"
              value={dossier?.advisory?.nextAdvisory ?? ""}
            />
          </Section>

          <Section title="INTENSITY">
            <Row label="WINDS" value={formatKtMph(d.maxWindKt)} />
            {d.minPressureMb != null && (
              <Row label="PRESSURE" value={`${d.minPressureMb} mb`} />
            )}
            <Row label="CLASS" value={category} />
          </Section>

          {d.windRadii &&
            (d.windRadii.kt34 || d.windRadii.kt50 || d.windRadii.kt64) && (
              <Section title="WIND RADII (nm)">
                <CycloneWindRadii radii={d.windRadii} />
              </Section>
            )}

          {movement && (
            <Section title="MOVEMENT">
              <Row label="MOVING" value={movement} />
            </Section>
          )}

          {coneAssets &&
            (coneAssets.ships.length > 0 || coneAssets.aircraft.length > 0) && (
              <Section title="ASSETS IN CONE">
                <Row label="SHIPS" value={String(coneAssets.ships.length)} />
                <Row
                  label="AIRCRAFT"
                  value={String(coneAssets.aircraft.length)}
                />
              </Section>
            )}

          {lf && (
            <Section title="LANDFALL">
              <div className="flex items-center justify-between">
                <span className="text-sig-accent text-xs">
                  ETA
                </span>
                <span
                  className="font-mono text-xs text-sig-dim"
                  style={lf.urgent ? { color: "var(--sigint-warn)" } : undefined}
                >
                  {lf.text}
                </span>
              </div>
            </Section>
          )}

          {d.forecast.length > 0 && (
            <Section title="INTENSITY TREND">
              <CycloneIntensityCurve storm={d} />
            </Section>
          )}

          {d.forecast.length > 0 && (
            <CollapsibleSection title="FORECAST TRACK" defaultOpen={true}>
              <button
                type="button"
                onClick={() => setShowModels((v) => !v)}
                aria-pressed={showModels}
                className={`mb-1.5 px-2 py-0.5 rounded text-xs font-mono tracking-wider border transition-colors ${
                  showModels
                    ? "text-sig-accent border-sig-accent/40 bg-sig-accent/15"
                    : "text-sig-dim border-sig-border hover:border-sig-grid/40"
                }`}
              >
                MODELS{showModels && models.length > 0 ? ` (${models.length})` : ""}
              </button>
              <CycloneForecastMiniMap
                current={{ lat: item.lat, lon: item.lon, maxWindKt: d.maxWindKt }}
                forecast={d.forecast}
                pastTrack={d.pastTrack}
                models={showModels ? models : undefined}
              />
              <div className="mt-2">
                {d.forecast.map((f) => (
                  <Row
                    key={f.fcstHour}
                    label={`+${f.fcstHour}h`}
                    value={`${formatKtShort(f.maxWindKt)} ${f.category}`}
                  />
                ))}
              </div>
            </CollapsibleSection>
          )}

          <CollapsibleSection title="ADVISORY" defaultOpen={false}>
            {loading && !dossier?.advisory ? (
              <div
                className="text-xs text-sig-text"
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
          </CollapsibleSection>

          <CollapsibleSection title="DISCUSSION" defaultOpen={false}>
            {loading && !dossier?.discussion ? (
              <div
                className="text-xs text-sig-text"
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
          </CollapsibleSection>

          <Section title="POSITION">
            <div className="text-sm font-mono text-sig-bright">
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
