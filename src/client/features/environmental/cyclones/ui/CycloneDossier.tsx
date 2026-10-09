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
import { landfallText, LandfallTone } from "../hooks/useLandfallEta";
import { CycloneIntensityCurve } from "./CycloneIntensityCurve";
import { CycloneForecastMiniMap } from "./CycloneForecastMiniMap";
import { CycloneForecastTimeline } from "./CycloneForecastTimeline";
import { CycloneAdvisoryBlock } from "./CycloneAdvisoryBlock";
import { useCycloneSituation } from "./CycloneDetailExtras";
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

export function CycloneDossier({ item, isolateMode, onLocate, onFocus, onSolo, onClose }: Props) {
  const { accent, assets, cyclone, dossier, hasAssets, hasForecast, hasRadii, landfall, loading, windRadii } =
    useCycloneSituation(item);
  const { setSelected } = useUI();
  const closeBtnRef = useDossierFocus(item.id);
  const history = trackHistory(cyclone);
  const landfallCopy = landfall ? landfallText(landfall) : null;
  const hazards = cyclone.hazards;
  const chancePosition = landfallPosition(landfall);
  const hasChances = Boolean(hazards && (hazards.windChances.length > 0 || Object.keys(hazards.arrival).length > 0));
  const badge = cyclone.saffirSimpson > SaffirSimpson.None ? `CAT ${cyclone.saffirSimpson}` : cycloneCategoryShortLabel(cyclone.classification);

  return (
    <div className="h-full min-w-0 flex flex-col" style={{ "--dossier-accent": accent } as CSSProperties}>
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
      <div className="@container/dossier flex-1 min-w-0 overflow-y-auto sigint-scroll p-3">
        <div className="w-full flex flex-col gap-3">
          <CyclonePlacard data={cyclone} issued={cyclone.lastUpdate} nextAdvisory={dossier?.advisory?.nextAdvisory} />
          <Section title="VITALS">
            <CycloneVitals data={cyclone} position={[item.lon, item.lat]} />
          </Section>
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
          {hasForecast && (
            <Section title="TRACK">
              <DossierCard className="p-2 flex-1 flex flex-col">
                <CycloneForecastMiniMap item={item} hazards={hazards} mapClassName="h-72 @min-[45rem]/dossier:h-96" />
              </DossierCard>
            </Section>
          )}
          <div className={StormDossierClassName.Pair}>
            {windRadii && hasRadii && (
              <Section title="WIND FIELD">
                <DossierCard className={StormDossierClassName.Card}>
                  <CycloneWindRose radii={windRadii} />
                </DossierCard>
              </Section>
            )}
            {hasAssets && (
              <Section title="IN THE CONE">
                <CycloneAssets assets={assets} />
              </Section>
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
          {hazards && hazards.threats.length > 0 && (
            <Section title="THREATS & POTENTIAL IMPACTS">
              <DossierCard>
                <CycloneThreatList threats={hazards.threats} />
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
          <Section title="NHC PRODUCTS">
            <CycloneAdvisoryBlock dossier={dossier} loading={loading} compact={false} />
          </Section>
          <Section title="INTEL LINKS">
            <DossierLinkGrid links={intelLinks(cyclone.basin, cyclone.stormId)} />
          </Section>
        </div>
      </div>
    </div>
  );
}
