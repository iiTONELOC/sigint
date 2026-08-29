import { Ship } from "lucide-react";
import type { FeatureDossierProps } from "@/features/base/presentation";
import {
  DetailField, DossierCard, DossierLabel, DossierLinkGrid, DossierPositionRow,
  DossierSectionLabel, DossierStatCell, DossierToolbar, useDossierFocus,
  type DossierLink,
} from "@/dossier";
import { AgeStyle, relativeAge } from "@/time";
import { useTrail } from "@/features/base/useTrail";
import { Domain } from "@shared/domain/identity";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { DossierFallback } from "@/panes/dossier/dossierFallback";
import { shipAnomalies, shipPresentation } from "../formatters/presentation";
import { VesselSilhouette } from "./VesselSilhouette";
import { EcdisScope } from "./EcdisScope";
import { RateOfTurn } from "./RateOfTurn";
import { ShipMiniMap } from "./ShipMiniMap";

enum ShipDossierClassName {
  Monospace = "font-mono",
}

type Props = FeatureDossierProps<Domain.Ships>;

function intelLinks(
  mmsi: number,
  imo: number | undefined,
): DossierLink[] {
  const links: DossierLink[] = [
    ["MarineTraffic", `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`],
    ["VesselFinder", `https://www.vesselfinder.com/vessels?mmsi=${mmsi}`],
  ];
  if (imo != null && imo > 0) {
    links.push([
      "Equasis",
      `https://www.equasis.org/EquasisWeb/restricted/ShipInfo?fs=Search&P_IMO=${imo}`,
    ]);
  }
  return links;
}

export function ShipDossier({ item, isolateMode, onLocate, onFocus, onSolo, onClose }: Props) {
  const d = item.data;
  const { mmsi, imo, navStatus, sog, cog, heading, rot } = d;
  const presentation = shipPresentation(d, `MMSI ${mmsi}`, DossierFallback.Unavailable);
  const anomalies = shipAnomalies(navStatus, sog);
  const closeBtnRef = useDossierFocus(item.id);
  const recordedTrail = useTrail(item.id, Domain.Ships);
  const age = item.timestamp
    ? relativeAge(new Date(item.timestamp).getTime(), AgeStyle.Verbose)
    : null;
  const trail = recordedTrail.map((p) => ({ lat: p.lat, lon: p.lon }));
  const links = intelLinks(mmsi, imo);

  return (
    <div className="@container/dossier h-full flex flex-col [--dossier-accent:var(--sigint-ships)]">
      <DossierToolbar
        icon={Ship}
        title={presentation.name}
        subtitle="AIS VESSEL"
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="flex-1 min-h-0 overflow-auto sigint-scroll p-3 flex flex-col gap-3">
        <div className="grid grid-cols-1 @min-[40rem]/dossier:grid-cols-2 @min-[76rem]/dossier:grid-cols-4 gap-2 items-start @min-[40rem]/dossier:items-stretch">

          <section className="min-w-0 flex flex-col @min-[40rem]/dossier:col-start-1 @min-[40rem]/dossier:row-start-1 @min-[76rem]/dossier:col-start-1 @min-[76rem]/dossier:row-start-1">
            <DossierSectionLabel>IDENTITY</DossierSectionLabel>
            <DossierCard className="relative overflow-hidden flex-1">
              <div className="h-1 bg-(--dossier-accent)" />
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-(length:--sig-text-md) text-sig-bright font-bold leading-snug truncate">{presentation.name}</div>
                    {presentation.description && <div className="text-(length:--sig-text-xs) text-sig-text mt-0.5 truncate">{presentation.description}</div>}
                  </div>
                  <span className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-2 py-0.5 rounded-full border border-(--dossier-accent)/60 text-(--dossier-accent) bg-(--dossier-accent)/10 whitespace-nowrap">
                    {presentation.navigation.alert ? "⚠ " : ""}{presentation.navigation.compactLabel}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <DossierStatCell label="MMSI" value={mmsi} valueClass={ShipDossierClassName.Monospace} />
                  <DossierStatCell label="IMO" value={presentation.imoValue} valueClass={ShipDossierClassName.Monospace} />
                  <DossierStatCell label="CALL" value={presentation.callSignText} valueClass={ShipDossierClassName.Monospace} />
                </div>
                {anomalies.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1 rounded-lg border border-sig-warn/30 bg-sig-warn/8 px-2.5 py-2">
                    {anomalies.map((a) => (
                      <div key={a} className="flex items-center gap-1.5 text-(length:--sig-text-xs) text-sig-warn">
                        <span aria-hidden={true}>⚠</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                )}
                {age && <div className="text-(length:--sig-text-xs) text-sig-dim mt-2">AIS · aisstream.io · {age}</div>}
              </div>
            </DossierCard>
          </section>

          <section className="min-w-0 flex flex-col order-2 @min-[40rem]/dossier:order-0 @min-[40rem]/dossier:col-start-1 @min-[40rem]/dossier:row-start-2 @min-[76rem]/dossier:col-start-2 @min-[76rem]/dossier:row-start-1 @min-[76rem]/dossier:row-span-2">
            <DossierSectionLabel>NAVIGATION</DossierSectionLabel>
            <DossierCard className="p-3 flex-1 flex flex-col gap-2.5">
              <EcdisScope heading={heading} cog={cog} sog={sog} />
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <DetailField
                  label="HEADING"
                  value={presentation.headingText}
                  valueClass={ShipDossierClassName.Monospace}
                />
                <DetailField
                  label="COG"
                  value={presentation.courseText}
                  valueClass={ShipDossierClassName.Monospace}
                />
                <DetailField
                  label="SOG"
                  value={presentation.speedText}
                  valueClass={ShipDossierClassName.Monospace}
                />
                <DetailField
                  label="SET / DRIFT"
                  value={presentation.driftText}
                  valueClass={ShipDossierClassName.Monospace}
                />
              </div>
              <div>
                <DossierLabel className="mb-1">RATE OF TURN</DossierLabel>
                <RateOfTurn rot={rot} />
              </div>
            </DossierCard>
          </section>

          <section className="min-w-0 flex flex-col order-3 @min-[40rem]/dossier:order-0 @min-[40rem]/dossier:col-start-2 @min-[40rem]/dossier:row-start-2 @min-[76rem]/dossier:col-span-2 @min-[76rem]/dossier:col-start-3 @min-[76rem]/dossier:row-start-1 @min-[76rem]/dossier:row-span-2">
            <DossierSectionLabel>CHART</DossierSectionLabel>
            <div className="aspect-4/3 @min-[40rem]/dossier:aspect-auto @min-[40rem]/dossier:h-auto @min-[40rem]/dossier:flex-1 @min-[40rem]/dossier:min-h-64">
              <ShipMiniMap lat={recordLatitude(item)} lon={recordLongitude(item)} heading={heading} cog={cog} sog={sog} trail={trail} />
            </div>
            <DossierPositionRow item={item} className="mt-2" />
          </section>

          <section className="min-w-0 flex flex-col order-1 @min-[40rem]/dossier:order-0 @min-[40rem]/dossier:col-start-2 @min-[40rem]/dossier:row-start-1 @min-[76rem]/dossier:col-start-1 @min-[76rem]/dossier:row-start-2">
            <DossierSectionLabel>VESSEL</DossierSectionLabel>
            <DossierCard className="p-3 flex-1 flex flex-col gap-3">
              <VesselSilhouette data={d} />
              <div className="grid grid-cols-2 gap-2">
                <DossierStatCell label="DESTINATION" value={presentation.destinationText} />
                <DossierStatCell label="ETA" value={presentation.etaText} />
                <DossierStatCell
                  label="DRAUGHT"
                  value={presentation.draughtText}
                />
                <DossierStatCell label="STATUS" value={presentation.navigation.compactLabel} />
              </div>
            </DossierCard>
          </section>

        </div>

        <section>
          <DossierSectionLabel>INTEL LINKS</DossierSectionLabel>
          <DossierLinkGrid links={links} />
        </section>
      </div>
    </div>
  );
}
