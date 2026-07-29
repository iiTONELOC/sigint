import type { SelectedIsolateMode } from "@/workers/render/protocol";
import { Ship, ExternalLink, LocateFixed } from "lucide-react";
import type { CSSProperties } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { formatLat, formatLon } from "@/lib/format/geoFormat";
import { formatKtMph } from "@/lib/format/units";
import { relativeAge } from "@/lib/format/timeFormat";
import { getTrail } from "@/lib/geo/trailService";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { DossierToolbar, mmsiCountry, useDossierFocus } from "@/panes/dossier/DossierAtoms";
import { SectionLabel, Card, StatCell, Field, Label } from "@/features/tracking/aircraft/ui/dossierKit";
import type { ShipData } from "../types";
import { navStatusMeta, setDrift, shipAnomalies } from "../shipMeta";
import { VesselSilhouette } from "./VesselSilhouette";
import { EcdisScope } from "./EcdisScope";
import { RateOfTurn } from "./RateOfTurn";
import { ShipMiniMap } from "./ShipMiniMap";

type Props = {
  readonly item: DataPoint;
  readonly isolateMode: SelectedIsolateMode;
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

export function ShipDossier({ item, isolateMode, onLocate, onFocus, onSolo, onClose }: Props) {
  const d = (item.data as ShipData) ?? {};
  const { name, mmsi, imo, callSign, vesselType, navStatus, sog, cog, heading, rot, destination, draught, eta } = d;
  const country = mmsi ? mmsiCountry(mmsi) : null;
  const nav = navStatusMeta(navStatus);
  const anomalies = shipAnomalies(navStatus, sog);
  const drift = setDrift(heading, cog);
  const closeBtnRef = useDossierFocus(item.id);
  const typeLine = [vesselType && vesselType !== "Unknown" ? vesselType : null, country].filter(Boolean).join(" · ");
  const age = item.timestamp ? relativeAge(new Date(item.timestamp).getTime(), "verbose") : null;
  const driftTxt = drift == null ? "—" : Math.abs(drift) < 1 ? "none" : `${Math.abs(Math.round(drift))}° ${drift > 0 ? "stbd" : "port"}`;
  const headingTxt = heading != null && heading !== 511 ? `${Math.round(heading)}°` : "—";
  const trail = getTrail(item.id).map((p) => ({ lat: p.lat, lon: p.lon }));

  const links: ReadonlyArray<readonly [string, string]> = [
    ["MarineTraffic", `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`],
    ["VesselFinder", `https://www.vesselfinder.com/vessels?mmsi=${mmsi}`],
    ...(imo != null && imo > 0
      ? ([["Equasis", `https://www.equasis.org/EquasisWeb/restricted/ShipInfo?fs=Search&P_IMO=${imo}`]] as const)
      : []),
  ];

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

          {/* IDENTITY — full width (med), col1/row1 (large) */}
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
                  <StatCell label="MMSI" value={mmsi ?? "—"} valueClass="font-mono" />
                  <StatCell label="IMO" value={imo != null && imo > 0 ? imo : "—"} valueClass="font-mono" />
                  <StatCell label="CALL" value={callSign || "—"} valueClass="font-mono" />
                </div>
                {anomalies.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1 rounded-lg border border-sig-warn/30 bg-sig-warn/8 px-2.5 py-2">
                    {anomalies.map((a) => (
                      <div key={a} className="flex items-center gap-1.5 text-(length:--sig-text-xs) text-sig-warn">
                        <span aria-hidden="true">⚠</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                )}
                {age && <div className="text-(length:--sig-text-xs) text-sig-dim mt-2">AIS · aisstream.io · {age}</div>}
              </div>
            </Card>
          </section>

          {/* NAVIGATION — row2/col1 (med), col2 spanning both rows (large) */}
          <section className="min-w-0 flex flex-col order-2 @min-[40rem]/dossier:order-0 @min-[40rem]/dossier:col-start-1 @min-[40rem]/dossier:row-start-2 @min-[76rem]/dossier:col-start-2 @min-[76rem]/dossier:row-start-1 @min-[76rem]/dossier:row-span-2">
            <SectionLabel>NAVIGATION</SectionLabel>
            <Card className="p-3 flex-1 flex flex-col gap-2.5">
              <EcdisScope heading={heading} cog={cog} sog={sog} />
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Field label="HEADING" value={headingTxt} valueClass="font-mono" />
                <Field label="COG" value={cog != null ? `${Math.round(cog)}°` : "—"} valueClass="font-mono" />
                <Field label="SOG" value={sog != null ? formatKtMph(Math.round(sog)) : "—"} valueClass="font-mono" />
                <Field label="SET / DRIFT" value={driftTxt} valueClass="font-mono" />
              </div>
              <div>
                <Label className="mb-1">RATE OF TURN</Label>
                <RateOfTurn rot={rot} />
              </div>
            </Card>
          </section>

          {/* CHART — full-width below nav+vessel (med), cols 3-4 / 2x (large) */}
          <section className="min-w-0 flex flex-col order-3 @min-[40rem]/dossier:order-0 @min-[40rem]/dossier:col-start-2 @min-[40rem]/dossier:row-start-2 @min-[76rem]/dossier:col-span-2 @min-[76rem]/dossier:col-start-3 @min-[76rem]/dossier:row-start-1 @min-[76rem]/dossier:row-span-2">
            <SectionLabel>CHART</SectionLabel>
            <div className="aspect-4/3 @min-[40rem]/dossier:aspect-auto @min-[40rem]/dossier:h-auto @min-[40rem]/dossier:flex-1 @min-[40rem]/dossier:min-h-64">
              <ShipMiniMap lat={recordLatitude(item)} lon={recordLongitude(item)} heading={heading} cog={cog} sog={sog} trail={trail} />
            </div>
            <div className="flex items-center justify-between bg-sig-panel border border-sig-border rounded-[10px] px-3 py-1.5 mt-2">
              <span className="flex items-center gap-1.5 text-(length:--sig-text-xs) text-sig-text">
                <LocateFixed className="w-3.5 h-3.5 text-(--dossier-accent)" aria-hidden="true" /> POSITION
              </span>
              <span className="text-(length:--sig-text-xs) text-sig-bright font-mono">{formatLat(recordLatitude(item))} · {formatLon(recordLongitude(item))}</span>
            </div>
          </section>

          {/* VESSEL — row2/col2 (med), under identity in col1 (large) */}
          <section className="min-w-0 flex flex-col order-1 @min-[40rem]/dossier:order-0 @min-[40rem]/dossier:col-start-2 @min-[40rem]/dossier:row-start-1 @min-[76rem]/dossier:col-start-1 @min-[76rem]/dossier:row-start-2">
            <SectionLabel>VESSEL</SectionLabel>
            <Card className="p-3 flex-1 flex flex-col gap-3">
              <VesselSilhouette dimA={d.dimA} dimB={d.dimB} dimC={d.dimC} dimD={d.dimD} length={d.length} width={d.width} draught={draught} />
              <div className="grid grid-cols-2 gap-2">
                <StatCell label="DESTINATION" value={destination || "—"} />
                <StatCell label="ETA" value={eta || "—"} />
                <StatCell label="DRAUGHT" value={draught != null && draught > 0 ? `${draught.toFixed(1)} m` : "—"} />
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
                <ExternalLink className="w-3 h-3 shrink-0 text-sig-dim" aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
