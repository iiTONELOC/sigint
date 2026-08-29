import { useId, type CSSProperties, type ReactNode } from "react";
import { Wind, ExternalLink } from "lucide-react";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { Domain } from "@shared/domain/identity";
import { DossierToolbar, useDossierFocus } from "@/dossier";
import { CycloneIntensityCurve } from "./CycloneIntensityCurve";
import { CycloneForecastMiniMap } from "./CycloneForecastMiniMap";
import { CycloneAdvisoryBlock } from "./CycloneAdvisoryBlock";
import { useCycloneSituation } from "./CycloneDetailExtras";
import { CyclonePlacard } from "./CyclonePlacard";
import { CycloneThreatStrip } from "./CycloneThreatStrip";
import { CycloneVitals } from "./CycloneVitals";
import { CycloneWindRose } from "./CycloneWindRose";
import { CycloneAssets } from "./CycloneAssets";

type Props = FeatureDossierProps<Domain.Cyclones>;

function DossierSection({
  title,
  children,
  className = "",
}: Readonly<{
  title: string;
  children: ReactNode;
  className?: string;
}>) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={className}>
      <h3
        id={headingId}
        className="text-(length:--sig-text-xs) font-semibold tracking-widest text-(--dossier-accent) mb-2"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function IntelLink({
  label,
  href,
}: Readonly<{ label: string; href: string }>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-2 bg-sig-panel border border-sig-border rounded-lg px-2.5 py-2 text-(length:--sig-text-sm) text-sig-accent hover:border-sig-accent/40 transition-colors"
    >
      <span className="truncate">{label}</span>
      <ExternalLink className="w-3 h-3 shrink-0 text-sig-dim" aria-hidden="true" />
    </a>
  );
}

export function CycloneDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
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
  const closeBtnRef = useDossierFocus(item.id);

  return (
    <div
      className="h-full min-w-0 flex flex-col"
      style={{ "--dossier-accent": accent } as CSSProperties}
    >
      <DossierToolbar
        icon={Wind}
        title={cyclone.name}
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="@container/dossier flex-1 min-w-0 overflow-y-auto sigint-scroll p-3">
        <div className="w-full max-w-275 mx-auto flex flex-col gap-3">
          <div className="grid w-full min-w-0 grid-cols-1 @min-[40rem]/dossier:grid-cols-2 gap-3 items-start *:min-w-0">
            <div className="min-w-0 flex flex-col gap-3">
              <CyclonePlacard data={cyclone} issued={cyclone.lastUpdate} />
              <CycloneThreatStrip landfall={landfall} />
            </div>
            <DossierSection title="VITALS" className="min-w-0">
              <CycloneVitals data={cyclone} position={[item.lon, item.lat]} />
            </DossierSection>
            {hasForecast && (
              <DossierSection
                title="FORECAST TRACK"
                className="min-w-0 order-2 @min-[40rem]/dossier:order-0 @min-[40rem]/dossier:col-span-2 h-full flex flex-col"
              >
                <CycloneForecastMiniMap
                  item={item}
                  mapClassName="h-72 @min-[40rem]/dossier:h-96"
                />
              </DossierSection>
            )}
            {windRadii && hasRadii && (
              <DossierSection
                title="WIND FIELD"
                className="min-w-0 order-3 @min-[40rem]/dossier:order-0"
              >
                <CycloneWindRose radii={windRadii} />
              </DossierSection>
            )}
            {hasForecast && (
              <section
                className="min-w-0 order-1 @min-[40rem]/dossier:order-0"
                aria-label="Intensity"
              >
                <CycloneIntensityCurve storm={cyclone} />
              </section>
            )}
            {hasAssets && (
              <DossierSection
                title="ASSETS IN CONE"
                className="min-w-0 @min-[40rem]/dossier:col-span-2"
              >
                <CycloneAssets assets={assets} />
              </DossierSection>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <CycloneAdvisoryBlock dossier={dossier} loading={loading} compact={false} />
            <DossierSection title="INTEL LINKS">
              <div className="grid grid-cols-1 @min-[28rem]/dossier:grid-cols-2 @min-[60rem]/dossier:grid-cols-3 gap-2">
                <IntelLink
                  label="NHC Storm Page"
                  href={`https://www.nhc.noaa.gov/graphics_${cyclone.basin.toLowerCase()}${cyclone.stormId.slice(2, 4)}.shtml`}
                />
                <IntelLink
                  label="Tropical Tidbits"
                  href="https://www.tropicaltidbits.com/storminfo/"
                />
                <IntelLink
                  label="NRL Tropical Cyclones"
                  href="https://www.nrlmry.navy.mil/TC.html"
                />
              </div>
            </DossierSection>
          </div>
        </div>
      </div>
    </div>
  );
}
