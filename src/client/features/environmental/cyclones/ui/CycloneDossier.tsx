import { Wind, ExternalLink } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import { useData } from "@/context/DataContext";
import type { CycloneData } from "../types";
import { useCycloneDossier } from "../hooks/useCycloneDossier";
import {
  DossierToolbar,
  CollapsibleSection,
  useDossierFocus,
} from "@/panes/dossier/DossierAtoms";
import { CycSection } from "./cycloneKit";
import { CycloneLayerToggles } from "./CycloneLayerToggles";
import { CycloneIntensityCurve } from "./CycloneIntensityCurve";
import { CycloneForecastMiniMap } from "./CycloneForecastMiniMap";
import { CycloneModelLegend } from "./CycloneModelLegend";
import { windColor } from "../classification";
import { useAssetsInCone } from "../hooks/useAssetsInCone";
import { useLandfallEta } from "../hooks/useLandfallEta";
import { useCycloneModels } from "../hooks/useCycloneModels";
import { CyclonePlacard } from "./CyclonePlacard";
import { CycloneThreatStrip } from "./CycloneThreatStrip";
import { CycloneVitals } from "./CycloneVitals";
import { CycloneWindRose } from "./CycloneWindRose";
import { CycloneAssets } from "./CycloneAssets";

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
  const closeBtnRef = useDossierFocus(item.id);
  const { dossier, loading } = useCycloneDossier(d.stormId);
  const coneAssets = useAssetsInCone(d.officialCone, d.advisoryNumber);
  const landfall = useLandfallEta(
    d.forecast,
    item.lat,
    item.lon,
    d.advisoryNumber,
    d.lastUpdate,
  );
  const { cycloneFilter, hiddenModels } = useData();
  const models = useCycloneModels(d.stormId, cycloneFilter.showModels);
  const visibleModels = models.filter((m) => !hiddenModels.has(m.model));

  const hasRadii =
    d.windRadii && (d.windRadii.kt34 || d.windRadii.kt50 || d.windRadii.kt64);

  return (
    <div
      className="h-full min-w-0 flex flex-col"
      style={{ "--dossier-accent": windColor(d.maxWindKt) } as React.CSSProperties}
    >
      <DossierToolbar
        icon={Wind}
        title={d.name}
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="@container/dossier flex-1 min-w-0 overflow-y-auto sigint-scroll p-3">
        {/* Content caps at a readable width + centres so it doesn't stretch into
            giant blocks on very large screens (TVs). The @container is on the
            scroll div above, so breakpoints still fire on the real pane width. */}
        <div className="w-full max-w-275 mx-auto flex flex-col gap-3">
        {/* Small: 1 col stacked. Medium+: 2-col grid (placard|vitals hero,
            track full-width, wind|intensity, assets full-width). */}
        <div className="grid w-full min-w-0 grid-cols-1 @min-[40rem]/dossier:grid-cols-2 gap-3 items-start *:min-w-0">

          {/* PLACARD + THREAT — left half of the hero row */}
          <div className="min-w-0 flex flex-col gap-3">
            <CyclonePlacard data={d} issued={d.lastUpdate} />
            <CycloneThreatStrip landfall={landfall} />
          </div>

          {/* VITALS — right half of the hero row */}
          <section className="min-w-0">
            <CycSection title="VITALS">
              <CycloneVitals data={d} lat={item.lat} lon={item.lon} />
            </CycSection>
          </section>

          {/* FORECAST TRACK — map, full width below the hero row.
              Small order: INTENSITY (1) → TRACK (2) → WIND FIELD (3). Reset at medium. */}
          {d.forecast.length > 0 && (
            <section className="min-w-0 order-2 @min-[40rem]/dossier:order-0 @min-[40rem]/dossier:col-span-2">
              <CycSection title="FORECAST TRACK" className="h-full flex flex-col">
                <div className="flex flex-col gap-2 flex-1 min-h-0">
                  <CycloneLayerToggles />
                  <div className="h-72 @min-[40rem]/dossier:h-96">
                    <CycloneForecastMiniMap
                      current={{ lat: item.lat, lon: item.lon, maxWindKt: d.maxWindKt }}
                      forecast={d.forecast}
                      pastTrack={d.pastTrack}
                      windRadii={d.windRadii}
                      showForecast={cycloneFilter.showForecast}
                      showCone={cycloneFilter.showCone}
                      showWindField={cycloneFilter.showWindField}
                      showModels={cycloneFilter.showModels}
                      models={visibleModels}
                    />
                  </div>
                  {cycloneFilter.showModels && models.length > 0 && (
                    <CycloneModelLegend models={models} />
                  )}
                </div>
              </CycSection>
            </section>
          )}

          {/* WIND FIELD — small order 3 (after track); left half at medium */}
          {hasRadii && (
            <section className="min-w-0 order-3 @min-[40rem]/dossier:order-0">
              <CycSection title="WIND FIELD">
                <CycloneWindRose radii={d.windRadii!} />
              </CycSection>
            </section>
          )}

          {/* INTENSITY — small order 1 (before track); right half at medium */}
          {d.forecast.length > 0 && (
            <section className="min-w-0 order-1 @min-[40rem]/dossier:order-0" aria-label="Intensity">
              <CycloneIntensityCurve storm={d} />
            </section>
          )}

          {/* ASSETS — full-width row */}
          {coneAssets && (coneAssets.aircraft.length > 0 || coneAssets.ships.length > 0) && (
            <section className="min-w-0 @min-[40rem]/dossier:col-span-2">
              <CycSection title="ASSETS IN CONE">
                <CycloneAssets assets={coneAssets} />
              </CycSection>
            </section>
          )}
        </div>

        {/* TEXT PRODUCTS + INTEL LINKS — full width below the grid. */}
        <div className="flex flex-col gap-3">
          <CollapsibleSection title="ADVISORY" defaultOpen={false}>
            {loading && !dossier?.advisory ? (
              <div className="text-(length:--sig-text-xs) text-sig-text" aria-live="polite">
                Loading…
              </div>
            ) : null}
            {dossier?.advisory ? (
              <pre className="text-(length:--sig-text-xs) text-sig-text whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                {dossier.advisory.body}
              </pre>
            ) : null}
          </CollapsibleSection>

          <CollapsibleSection title="FORECAST DISCUSSION" defaultOpen={false}>
            {loading && !dossier?.discussion ? (
              <div className="text-(length:--sig-text-xs) text-sig-text" aria-live="polite">
                Loading…
              </div>
            ) : null}
            {dossier?.discussion ? (
              <pre className="text-(length:--sig-text-xs) text-sig-text whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                {dossier.discussion.body}
              </pre>
            ) : null}
          </CollapsibleSection>

          {/* INTEL LINKS — at the end, after the text products. */}
          <CycSection title="INTEL LINKS">
            <div className="grid grid-cols-1 @min-[28rem]/dossier:grid-cols-2 @min-[60rem]/dossier:grid-cols-3 gap-2">
              {(
                [
                  [
                    "NHC Storm Page",
                    `https://www.nhc.noaa.gov/graphics_${d.basin.toLowerCase()}${d.stormId.slice(2, 4)}.shtml`,
                  ],
                  ["Tropical Tidbits", "https://www.tropicaltidbits.com/storminfo/"],
                  ["NRL Tropical Cyclones", "https://www.nrlmry.navy.mil/TC.html"],
                ] as const
              ).map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 bg-sig-panel border border-sig-border rounded-lg px-2.5 py-2 text-(length:--sig-text-sm) text-sig-accent hover:border-sig-accent/40 transition-colors"
                >
                  <span className="truncate">{label}</span>
                  <ExternalLink className="w-3 h-3 shrink-0 text-sig-dim" aria-hidden="true" />
                </a>
              ))}
            </div>
          </CycSection>
        </div>
        </div>
      </div>
    </div>
  );
}
