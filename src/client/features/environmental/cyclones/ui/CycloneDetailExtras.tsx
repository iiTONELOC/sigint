import type { CSSProperties, ReactNode } from "react";
import type { CyclonePoint } from "../data/codec";
import { windColor } from "../classification";
import { useAssetsInCone } from "../hooks/useAssetsInCone";
import { useCycloneDossier } from "../hooks/useCycloneDossier";
import { useLandfallEta } from "../hooks/useLandfallEta";
import { CyclonePlacard } from "./CyclonePlacard";
import { CycloneThreatStrip } from "./CycloneThreatStrip";
import { CycloneVitals } from "./CycloneVitals";
import { CycloneIntensityCurve } from "./CycloneIntensityCurve";
import { CycloneForecastMiniMap } from "./CycloneForecastMiniMap";
import { CycloneWindRose } from "./CycloneWindRose";
import { CycloneAssets } from "./CycloneAssets";
import { CycloneAdvisoryBlock } from "./CycloneAdvisoryBlock";

function DetailSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
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

export function useCycloneSituation(item: CyclonePoint) {
  const cyclone = item.data;
  const accent = windColor(cyclone.maxWindKt);
  const assets = useAssetsInCone(
    cyclone.officialCone,
    cyclone.advisoryNumber,
  );
  const landfall = useLandfallEta(
    cyclone.forecast,
    item.lat,
    item.lon,
    cyclone.advisoryNumber,
    cyclone.lastUpdate,
  );
  const { dossier, loading } = useCycloneDossier(item.id);
  const windRadii = cyclone.windRadii;
  const hasForecast = cyclone.forecast.length > 0;
  const hasRadii = Boolean(
    windRadii && (windRadii.kt34 || windRadii.kt50 || windRadii.kt64),
  );
  const hasAssets =
    assets !== null &&
    (assets.ships.length > 0 || assets.aircraft.length > 0);
  return {
    accent,
    assets,
    cyclone,
    dossier,
    hasAssets,
    hasForecast,
    hasRadii,
    landfall,
    loading,
    windRadii,
  };
}

export function CycloneDetailExtras({ item }: { readonly item: CyclonePoint }) {
  const {
    accent,
    assets,
    cyclone,
    dossier,
    hasAssets,
    hasForecast,
    hasRadii,
    landfall,
    loading,
    windRadii,
  } = useCycloneSituation(item);

  return (
    <div
      className="@container/dossier flex flex-col gap-1"
      style={{ "--dossier-accent": accent } as CSSProperties}
    >
      <div className="mt-2 pt-2 border-t border-sig-border">
        <CyclonePlacard data={cyclone} issued={cyclone.lastUpdate} compact />
      </div>
      {landfall && (
        <div className="mt-2 pt-2 border-t border-sig-border">
          <CycloneThreatStrip landfall={landfall} />
        </div>
      )}
      <DetailSection title="VITALS">
        <CycloneVitals data={cyclone} position={[item.lon, item.lat]} />
      </DetailSection>
      {hasForecast && (
        <div className="mt-2 pt-2 border-t border-sig-border">
          <CycloneIntensityCurve storm={cyclone} />
        </div>
      )}
      {hasForecast && (
        <DetailSection title="FORECAST TRACK">
          <CycloneForecastMiniMap item={item} />
        </DetailSection>
      )}
      {windRadii && hasRadii && (
        <DetailSection title="WIND FIELD">
          <CycloneWindRose radii={windRadii} />
        </DetailSection>
      )}
      {hasAssets && (
        <DetailSection title="ASSETS IN CONE">
          <CycloneAssets assets={assets} />
        </DetailSection>
      )}
      <CycloneAdvisoryBlock
        dossier={dossier}
        loading={loading}
        compact
      />
    </div>
  );
}
