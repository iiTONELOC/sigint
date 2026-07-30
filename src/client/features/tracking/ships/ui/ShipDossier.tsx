import type { SelectedIsolateMode } from "@/workers/render/protocol";
import { Ship, ExternalLink, LocateFixed } from "lucide-react";
import type { CSSProperties } from "react";
import type {
  ShipPoint,
} from "@/features/tracking/ships/data/codec";
import { formatLat, formatLon } from "@/lib/format/geoFormat";
import { formatKtMph } from "@/lib/format/units";
import { AgeStyle, relativeAge } from "@/lib/format/timeFormat";
import { useTrail } from "@/features/base/useTrail";
import { Domain } from "@shared/domain/identity";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { DossierToolbar, mmsiCountry, useDossierFocus } from "@/panes/dossier/DossierAtoms";
import { DossierFallback } from "@/panes/dossier/dossierFallback";
import { SectionLabel, Card, StatCell, Field, Label } from "@/features/tracking/aircraft/ui/dossierKit";
import {
  AisHeading,
  ShipDataLabel,
  type ShipData,
} from "../types";
import { navStatusMeta, setDrift, shipAnomalies } from "../shipMeta";
import { VesselSilhouette } from "./VesselSilhouette";
import { EcdisScope } from "./EcdisScope";
import { RateOfTurn } from "./RateOfTurn";
import { ShipMiniMap } from "./ShipMiniMap";

enum ShipDossierClassName {
  Monospace = "font-mono",
}

type Props = {
  readonly item: ShipPoint;
  readonly isolateMode: SelectedIsolateMode;
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

function driftText(drift: number | null): string {
  if (drift === null) return DossierFallback.Unavailable;
  if (Math.abs(drift) < 1) return "none";
  const side = drift > 0 ? "stbd" : "port";
  return `${Math.abs(Math.round(drift))}° ${side}`;
}

function headingText(heading: number | undefined): string {
  return heading != null && heading !== AisHeading.Unavailable
    ? `${Math.round(heading)}°`
    : DossierFallback.Unavailable;
}

function vesselTypeLine(
  vesselType: string | undefined,
  country: string | null,
): string {
  const type =
    vesselType && vesselType !== ShipDataLabel.Unknown
      ? vesselType
      : null;
  return [type, country].filter(Boolean).join(" · ");
}

function imoText(imo: number | undefined): number | string {
  return imo != null && imo > 0
    ? imo
    : DossierFallback.Unavailable;
}

function courseText(course: number | undefined): string {
  return course != null
    ? `${Math.round(course)}°`
    : DossierFallback.Unavailable;
}

function speedText(speed: number | undefined): string {
  return speed != null
    ? formatKtMph(Math.round(speed))
    : DossierFallback.Unavailable;
}

function draughtText(draught: number | undefined): string {
  return draught != null && draught > 0
    ? `${draught.toFixed(1)} m`
    : DossierFallback.Unavailable;
}

function intelLinks(
  mmsi: number | undefined,
  imo: number | undefined,
): Array<readonly [string, string]> {
  const links: Array<readonly [string, string]> = [
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
  const d: ShipData = item.data;
  const { name, mmsi, imo, callSign, vesselType, navStatus, sog, cog, heading, rot, destination, draught, eta } = d;
  const country = mmsi ? mmsiCountry(mmsi) : null;
  const nav = navStatusMeta(navStatus);
  const anomalies = shipAnomalies(navStatus, sog);
  const drift = setDrift(heading, cog);
  const closeBtnRef = useDossierFocus(item.id);
  const recordedTrail = useTrail(item.id, Domain.Ships);
  const typeLine = vesselTypeLine(vesselType, country);
  const age = item.timestamp
    ? relativeAge(new Date(item.timestamp).getTime(), AgeStyle.Verbose)
    : null;
  const driftTxt = driftText(drift);
  const headingTxt = headingText(heading);
  const trail = recordedTrail.map((p) => ({ lat: p.lat, lon: p.lon }));
  const links = intelLinks(mmsi, imo);

  return (
    <div className="@container/dossier h-full flex flex-col" style={{ "--dossier-accent": "var(--sigint-ships)" } as CSSProperties}>
      <DossierToolbar
        icon={Ship}
        title={name || `MMSI ${mmsi}`}
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

          {/* Identity fills the first column on large dossiers. */}
          <section className="min-w-0 flex flex-col @min-[40rem]/dossier:col-start-1 @min-[40rem]/dossier:row-start-1 @min-[76rem]/dossier:col-start-1 @min-[76rem]/dossier:row-start-1">
            <SectionLabel>IDENTITY</SectionLabel>
            <Card className="relative overflow-hidden flex-1">
              <div className="h-1 bg-(--dossier-accent)" />
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-(length:--sig-text-md) text-sig-bright font-bold leading-snug truncate">{name || `MMSI ${mmsi}`}</div>
                    {typeLine && <div className="text-(length:--sig-text-xs) text-sig-text mt-0.5 truncate">{typeLine}</div>}
                  </div>
                  <span className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-2 py-0.5 rounded-full border border-(--dossier-accent)/60 text-(--dossier-accent) bg-(--dossier-accent)/10 whitespace-nowrap">
                    {nav.alert ? "⚠ " : ""}{nav.label}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <StatCell label="MMSI" value={mmsi ?? DossierFallback.Unavailable} valueClass={ShipDossierClassName.Monospace} />
                  <StatCell label="IMO" value={imoText(imo)} valueClass={ShipDossierClassName.Monospace} />
                  <StatCell label="CALL" value={callSign || DossierFallback.Unavailable} valueClass={ShipDossierClassName.Monospace} />
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
            </Card>
          </section>

          {/* Navigation spans both rows on large dossiers. */}
          <section className="min-w-0 flex flex-col order-2 @min-[40rem]/dossier:order-0 @min-[40rem]/dossier:col-start-1 @min-[40rem]/dossier:row-start-2 @min-[76rem]/dossier:col-start-2 @min-[76rem]/dossier:row-start-1 @min-[76rem]/dossier:row-span-2">
            <SectionLabel>NAVIGATION</SectionLabel>
            <Card className="p-3 flex-1 flex flex-col gap-2.5">
              <EcdisScope heading={heading} cog={cog} sog={sog} />
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Field label="HEADING" value={headingTxt} valueClass={ShipDossierClassName.Monospace} />
                <Field label="COG" value={courseText(cog)} valueClass={ShipDossierClassName.Monospace} />
                <Field label="SOG" value={speedText(sog)} valueClass={ShipDossierClassName.Monospace} />
                <Field label="SET / DRIFT" value={driftTxt} valueClass={ShipDossierClassName.Monospace} />
              </div>
              <div>
                <Label className="mb-1">RATE OF TURN</Label>
                <RateOfTurn rot={rot} />
              </div>
            </Card>
          </section>

          {/* The chart fills the right side on large dossiers. */}
          <section className="min-w-0 flex flex-col order-3 @min-[40rem]/dossier:order-0 @min-[40rem]/dossier:col-start-2 @min-[40rem]/dossier:row-start-2 @min-[76rem]/dossier:col-span-2 @min-[76rem]/dossier:col-start-3 @min-[76rem]/dossier:row-start-1 @min-[76rem]/dossier:row-span-2">
            <SectionLabel>CHART</SectionLabel>
            <div className="aspect-4/3 @min-[40rem]/dossier:aspect-auto @min-[40rem]/dossier:h-auto @min-[40rem]/dossier:flex-1 @min-[40rem]/dossier:min-h-64">
              <ShipMiniMap lat={recordLatitude(item)} lon={recordLongitude(item)} heading={heading} cog={cog} sog={sog} trail={trail} />
            </div>
            <div className="flex items-center justify-between bg-sig-panel border border-sig-border rounded-[10px] px-3 py-1.5 mt-2">
              <span className="flex items-center gap-1.5 text-(length:--sig-text-xs) text-sig-text">
                <LocateFixed className="w-3.5 h-3.5 text-(--dossier-accent)" aria-hidden={true} /> POSITION
              </span>
              <span className="text-(length:--sig-text-xs) text-sig-bright font-mono">{formatLat(recordLatitude(item))} · {formatLon(recordLongitude(item))}</span>
            </div>
          </section>

          {/* Vessel details sit below identity on large dossiers. */}
          <section className="min-w-0 flex flex-col order-1 @min-[40rem]/dossier:order-0 @min-[40rem]/dossier:col-start-2 @min-[40rem]/dossier:row-start-1 @min-[76rem]/dossier:col-start-1 @min-[76rem]/dossier:row-start-2">
            <SectionLabel>VESSEL</SectionLabel>
            <Card className="p-3 flex-1 flex flex-col gap-3">
              <VesselSilhouette dimA={d.dimA} dimB={d.dimB} dimC={d.dimC} dimD={d.dimD} length={d.length} width={d.width} draught={draught} />
              <div className="grid grid-cols-2 gap-2">
                <StatCell label="DESTINATION" value={destination || DossierFallback.Unavailable} />
                <StatCell label="ETA" value={eta || DossierFallback.Unavailable} />
                <StatCell label="DRAUGHT" value={draughtText(draught)} />
                <StatCell label="STATUS" value={nav.label} />
              </div>
            </Card>
          </section>

        </div>

        <section>
          <SectionLabel>INTEL LINKS</SectionLabel>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
            {links.map(([label, href]) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 bg-sig-panel border border-sig-border rounded-lg px-2.5 py-2 text-(length:--sig-text-sm) text-sig-accent hover:border-sig-accent/40 transition-colors"
              >
                <span className="truncate">{label}</span>
                <ExternalLink className="w-3 h-3 shrink-0 text-sig-dim" aria-hidden={true} />
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
