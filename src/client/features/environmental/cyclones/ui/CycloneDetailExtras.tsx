import type { DataPoint } from "@/features/base/dataPoints";
import { useData } from "@/context/DataContext";
import { windColor } from "../classification";
import { useAssetsInCone } from "../hooks/useAssetsInCone";
import { useLandfallEta } from "../hooks/useLandfallEta";
import { useCycloneModels } from "../hooks/useCycloneModels";
import { CyclonePlacard } from "./CyclonePlacard";
import { CycloneThreatStrip } from "./CycloneThreatStrip";
import { CycloneVitals } from "./CycloneVitals";
import { CycloneIntensityCurve } from "./CycloneIntensityCurve";
import { CycloneForecastMiniMap } from "./CycloneForecastMiniMap";
import { CycloneModelLegend } from "./CycloneModelLegend";
import { CycloneLayerToggles } from "./CycloneLayerToggles";
import { CycloneWindRose } from "./CycloneWindRose";
import { CycloneAssets } from "./CycloneAssets";

// Info-forward cyclone block for the (static) detail pane. Leads with the
// life-safety read — landfall, vitals, wind field, assets — so users who never
// open the dossier still get it. Category accent drives every heading via
// --dossier-accent (windColor); no inline color styles.

function DetailSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="mt-2 pt-2 border-t border-sig-border">
      <div className="text-(length:--sig-text-sm) font-semibold font-mono tracking-widest mb-1.5 text-(--dossier-accent)">
        {title}
      </div>
      {children}
    </div>
  );
}

export function CycloneDetailExtras({
  item,
}: {
  readonly item: DataPoint & { type: "cyclones" };
}) {
  const d = item.data;
  const { cycloneFilter, hiddenModels } = useData();
  const models = useCycloneModels(d.stormId, cycloneFilter.showModels);
  const visibleModels = models.filter((m) => !hiddenModels.has(m.model));
  const assets = useAssetsInCone(d.officialCone, d.advisoryNumber);
  const landfall = useLandfallEta(
    d.forecast,
    item.lat,
    item.lon,
    d.advisoryNumber,
    d.lastUpdate,
  );
  const hasForecast = d.forecast.length > 0;
  const hasRadii =
    d.windRadii && (d.windRadii.kt34 || d.windRadii.kt50 || d.windRadii.kt64);
  const hasAssets =
    !!assets && (assets.ships.length > 0 || assets.aircraft.length > 0);

  return (
    <div
      className="@container/dossier flex flex-col gap-1"
      style={{ "--dossier-accent": windColor(d.maxWindKt) } as React.CSSProperties}
    >
      <div className="mt-2 pt-2 border-t border-sig-border">
        <CyclonePlacard data={d} issued={d.lastUpdate} compact />
      </div>
      {landfall && (
        <div className="mt-2 pt-2 border-t border-sig-border">
          <CycloneThreatStrip landfall={landfall} />
        </div>
      )}
      <DetailSection title="VITALS">
        <CycloneVitals data={d} lat={item.lat} lon={item.lon} />
      </DetailSection>
      {hasForecast && (
        <div className="mt-2 pt-2 border-t border-sig-border">
          <CycloneIntensityCurve storm={d} />
        </div>
      )}
      {hasForecast && (
        <DetailSection title="FORECAST TRACK">
          <div className="flex flex-col gap-2">
            <CycloneLayerToggles />
            <div className="h-72">
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
        </DetailSection>
      )}
      {hasRadii && (
        <DetailSection title="WIND FIELD">
          <CycloneWindRose radii={d.windRadii!} />
        </DetailSection>
      )}
      {hasAssets && (
        <DetailSection title="ASSETS IN CONE">
          <CycloneAssets assets={assets} />
        </DetailSection>
      )}
    </div>
  );
}
