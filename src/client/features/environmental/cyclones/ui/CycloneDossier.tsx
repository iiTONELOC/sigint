import type { CSSProperties, ReactNode } from "react";
import { Wind } from "lucide-react";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { Domain } from "@shared/domain/identity";
import { relativeAge } from "@/time";
import { useUI } from "@/context/UIContext";
import { DossierCard, DossierLabel, DossierLinkGrid, DossierTextClass, DossierToolbar, useDossierFocus, type DossierLink } from "@/dossier";
import { SaffirSimpson, cycloneCategoryShortLabel } from "@shared/domain/cyclones";
import { cycloneForecastPoint } from "../data/forecastProjection";
import { trackHistory } from "../data/intensity";
import { landfallText, LandfallTone, useLandfallEta } from "../hooks/useLandfallEta";
import { useAssetsInCone } from "../hooks/useAssetsInCone";
import { useCycloneDossier } from "../hooks/useCycloneDossier";
import { windColor } from "../classification";
import type { CyclonePoint } from "../data/codec";
import { CycloneIntensityCurve } from "./CycloneIntensityCurve";
import { CycloneForecastMiniMap } from "./CycloneForecastMiniMap";
import { CycloneForecastTimeline } from "./CycloneForecastTimeline";
import { CycloneAdvisoryBlock } from "./CycloneAdvisoryBlock";
import { CyclonePlacard } from "./CyclonePlacard";
import { CycloneVitals } from "./CycloneVitals";
import { CycloneWindRose } from "./CycloneWindRose";
import { CycloneAssets } from "./CycloneAssets";
import { CycloneHistoryPanel } from "./CycloneHistoryPanel";
import { CycloneSurgeList, CycloneThreatList, CycloneWindChancePanel } from "./CycloneHazards";
import { LandfallKind, type Landfall } from "../data/landfall";
import type { GeoPoint } from "@shared/geo";

type Props = FeatureDossierProps<Domain.Cyclones>;

enum StormDossierClassName {
  Pair = "grid gap-3 grid-cols-1 @min-[45rem]/dossier:grid-cols-2 items-stretch [&>:last-child:nth-child(odd)]:col-span-full",
  WindRow = "flex flex-wrap gap-3",
  WindCell = "flex flex-[1_1_auto]",
  ConeCell = "flex flex-[1000_1_0%] min-w-min",
  Fill = "flex-1",
  Stretch = "min-w-0 flex flex-col",
  Card = "p-3 flex-1",
}

const LANDFALL_TONE_CLASS: Readonly<Record<LandfallTone, string>> = {
  [LandfallTone.Critical]: "text-sig-danger",
  [LandfallTone.Forecast]: "text-sig-warn",
  [LandfallTone.Neutral]: "text-sig-dim",
};

function Section({ title, children, className = "" }: Readonly<{ title: string; children: ReactNode; className?: string }>) {
  return (
    <section aria-label={title} className={`${StormDossierClassName.Stretch} ${className}`}>
      <h3 className="text-(length:--sig-text-xs) font-semibold tracking-widest text-(--dossier-accent) mb-2">{title}</h3>
      {children}
    </section>
  );
}

function FooterItem({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <span className="flex items-baseline gap-2 min-w-0">
      <DossierLabel>{label}</DossierLabel>
      {children}
    </span>
  );
}

function accentStyle(color: string): CSSProperties {
  return { "--dossier-accent": color } as CSSProperties;
}

function landfallPosition(landfall: Landfall | null): GeoPoint | null {
  return landfall?.kind === LandfallKind.EstimatedArrival || landfall?.kind === LandfallKind.Onshore
    ? landfall.position
    : null;
}

function intelLinks(basin: string, stormId: string): readonly DossierLink[] {
  return [
    ["NHC Storm Page", `https://www.nhc.noaa.gov/graphics_${basin.toLowerCase()}${stormId.slice(2, 4)}.shtml`],
    ["Tropical Tidbits", "https://www.tropicaltidbits.com/storminfo/"],
    ["NRL Tropical Cyclones", "https://www.nrlmry.navy.mil/TC.html"],
  ];
}

function useCycloneSituation(item: CyclonePoint) {
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
    (assets.ships.length > 0 || assets.aircraft.length > 0 || assets.warnings.length > 0);
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

export function CycloneDossierBody({ item }: Readonly<{ item: CyclonePoint }>) {
  const { accent, assets, cyclone, dossier, hasAssets, hasForecast, hasRadii, landfall, loading, windRadii } =
    useCycloneSituation(item);
  const { setSelected } = useUI();
  const history = trackHistory(cyclone);
  const landfallCopy = landfall ? landfallText(landfall) : null;
  const hazards = cyclone.hazards;
  const chancePosition = landfallPosition(landfall);
  const hasChances = Boolean(hazards && (hazards.windChances.length > 0 || Object.keys(hazards.arrival).length > 0));

  return (
    <div className="@container/dossier w-full flex flex-col gap-3" style={accentStyle(accent)}>
      <CyclonePlacard data={cyclone} issued={cyclone.lastUpdate} nextAdvisory={dossier?.advisory?.nextAdvisory} />
      <Section title="VITALS">
        <CycloneVitals data={cyclone} position={[item.lon, item.lat]} />
      </Section>
      {hazards && hazards.threats.length > 0 && (
        <Section title="THREATS & POTENTIAL IMPACTS">
          <DossierCard>
            <CycloneThreatList threats={hazards.threats} />
          </DossierCard>
        </Section>
      )}
      {hasForecast && (
        <Section title="TRACK">
          <DossierCard className="p-2 flex-1 flex flex-col">
            <CycloneForecastMiniMap item={item} hazards={hazards} mapClassName="h-72 @min-[45rem]/dossier:h-96" />
          </DossierCard>
        </Section>
      )}
      {hasForecast && (
        <Section title="FORECAST TIMELINE">
          <DossierCard className="p-3">
            <CycloneForecastTimeline
              currentWindKt={cyclone.maxWindKt}
              forecast={cyclone.forecast}
              issuedAt={cyclone.lastUpdate}
              selectedHour={null}
              onSelect={(point) => { if (point) setSelected(cycloneForecastPoint(item, point)); }}
            />
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 mt-3 pt-3 border-t border-dashed border-sig-border">
              {landfallCopy && (
                <FooterItem label="LANDFALL">
                  <span className={`${DossierTextClass.Value} ${LANDFALL_TONE_CLASS[landfallCopy.tone]}`}>{landfallCopy.text}</span>
                </FooterItem>
              )}
              {history && (
                <FooterItem label="AGE">
                  <span className={DossierTextClass.Value}>{relativeAge(history.formedAt)} · {history.series.length} fixes</span>
                </FooterItem>
              )}
            </div>
          </DossierCard>
        </Section>
      )}
      {hazards && (hazards.peakSurge.length > 0 || hasChances) && (
        <div className={StormDossierClassName.Pair}>
          {hazards.peakSurge.length > 0 && (
            <Section title="PEAK STORM SURGE">
              <DossierCard className={StormDossierClassName.Card}>
                <CycloneSurgeList areas={hazards.peakSurge} />
              </DossierCard>
            </Section>
          )}
          {hasChances && (
            <Section title={chancePosition ? "WIND CHANCES AT LANDFALL" : "WIND ARRIVAL"}>
              <DossierCard className={StormDossierClassName.Card}>
                <CycloneWindChancePanel chances={hazards.windChances} arrival={hazards.arrival} position={chancePosition} />
              </DossierCard>
            </Section>
          )}
        </div>
      )}
      <div className={StormDossierClassName.WindRow}>
        {windRadii && hasRadii && (
          <div className={StormDossierClassName.WindCell}>
            <Section title="WIND FIELD" className={StormDossierClassName.Fill}>
              <DossierCard className={StormDossierClassName.Card}>
                <CycloneWindRose radii={windRadii} />
              </DossierCard>
            </Section>
          </div>
        )}
        {hasAssets && (
          <div className={StormDossierClassName.ConeCell}>
            <Section title="IN THE CONE" className={StormDossierClassName.Fill}>
              <CycloneAssets assets={assets} />
            </Section>
          </div>
        )}
      </div>
      <div className={StormDossierClassName.Pair}>
        {hasForecast && (
          <Section title="FORECAST">
            <DossierCard className={StormDossierClassName.Card}>
              <CycloneIntensityCurve storm={cyclone} />
            </DossierCard>
          </Section>
        )}
        {history && (
          <Section title="HISTORY">
            <DossierCard className={StormDossierClassName.Card}>
              <CycloneHistoryPanel storm={cyclone} />
            </DossierCard>
          </Section>
        )}
      </div>
      <Section title="NHC PRODUCTS">
        <CycloneAdvisoryBlock dossier={dossier} loading={loading} compact={false} />
      </Section>
      <Section title="INTEL LINKS">
        <DossierLinkGrid links={intelLinks(cyclone.basin, cyclone.stormId)} />
      </Section>
    </div>
  );
}

export function CycloneDossier({ item, isolateMode, onLocate, onFocus, onSolo, onClose }: Props) {
  const cyclone = item.data;
  const closeBtnRef = useDossierFocus(item.id);
  const badge = cyclone.saffirSimpson > SaffirSimpson.None ? `CAT ${cyclone.saffirSimpson}` : cycloneCategoryShortLabel(cyclone.classification);

  return (
    <div className="h-full min-w-0 flex flex-col" style={accentStyle(windColor(cyclone.maxWindKt))}>
      <DossierToolbar
        icon={Wind}
        title={cyclone.name}
        badge={badge}
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="flex-1 min-w-0 overflow-y-auto sigint-scroll p-3">
        <CycloneDossierBody item={item} />
      </div>
    </div>
  );
}
