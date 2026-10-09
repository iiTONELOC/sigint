import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  CYCLONE_THREAT_LEVELS,
  CycloneArrivalKind,
  CycloneThreatLevel,
  type CycloneArrivals,
  type CycloneSurgeArea,
  type CycloneThreat,
  type CycloneWindChances,
} from "@shared/domain/cyclones";
import { ringContainsPoint, type GeoPoint } from "@shared/geo";
import { spacedUpperCase } from "@shared/text";
import { formatKtShort } from "@/measurements";
import { DossierLabel, DossierTextClass } from "@/dossier";

const THREAT_LEVEL_CLASS: Readonly<Record<CycloneThreatLevel, string>> = {
  [CycloneThreatLevel.None]: "text-sig-dim",
  [CycloneThreatLevel.Elevated]: "text-sig-warn",
  [CycloneThreatLevel.Moderate]: "text-sig-fires",
  [CycloneThreatLevel.High]: "text-sig-danger",
  [CycloneThreatLevel.Extreme]: "text-sig-events",
};

// None sits first, so a level's index is how many rated steps it fills.
const RATED_LEVEL_COUNT = CYCLONE_THREAT_LEVELS.length - 1;
const SURGE_ROWS_SHOWN = 8;
const PERCENT_SIGN = "%";
const BAND_DIGITS = /\d+/g;
const PERCENT_DECILE = 10;

enum HazardClassName {
  ThreatRow = "grid grid-cols-[minmax(0,1fr)_auto] @min-[36rem]/dossier:grid-cols-[minmax(0,9rem)_minmax(0,7rem)_minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 items-center p-3",
  Spanning = "col-span-2 @min-[36rem]/dossier:col-span-1",
  Wrap = "min-w-0 wrap-anywhere",
  Group = "group",
  Meter = "flex gap-0.5 min-w-0",
  Segment = "h-1.5 flex-1 rounded-sm",
  Row = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 items-baseline",
  Disclosure = "cursor-pointer list-none select-none",
  Chevron = "size-3 shrink-0 text-sig-dim transition-transform group-open:rotate-90",
}

function Meter({ filled, total, toneClass }: Readonly<{ filled: number; total: number; toneClass: string }>) {
  const fillClass = `bg-current ${toneClass}`;
  return (
    <div className={HazardClassName.Meter} aria-hidden={true}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={`${HazardClassName.Segment} ${index < filled ? fillClass : "bg-sig-border"}`} />
      ))}
    </div>
  );
}

function ImpactList({ impacts }: Readonly<{ impacts: readonly string[] }>) {
  return (
    <ul className={`${DossierTextClass.Body} leading-relaxed list-disc pl-4 wrap-anywhere`}>
      {impacts.map((impact) => <li key={impact}>{impact}</li>)}
    </ul>
  );
}

function MoreToggle({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <details className={HazardClassName.Group}>
      <summary className={`flex items-center gap-1 ${HazardClassName.Disclosure} ${DossierTextClass.Label}`}>
        <ChevronRight className={HazardClassName.Chevron} aria-hidden />
        {title}
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

function ThreatHeader({ threat, expandable }: Readonly<{ threat: CycloneThreat; expandable: boolean }>) {
  const tone = THREAT_LEVEL_CLASS[threat.level];
  return (
    <>
      <DossierLabel>{spacedUpperCase(threat.kind)}</DossierLabel>
      <span className={`text-(length:--sig-text-sm) font-mono font-bold text-right @min-[36rem]/dossier:text-left ${tone}`}>
        {spacedUpperCase(threat.level)}
      </span>
      <div className={HazardClassName.Spanning}>
        <Meter filled={CYCLONE_THREAT_LEVELS.indexOf(threat.level)} total={RATED_LEVEL_COUNT} toneClass={tone} />
      </div>
      <span className={`${HazardClassName.Spanning} flex items-center gap-1.5 min-w-0 ${DossierTextClass.Body}`}>
        {expandable && <ChevronRight className={HazardClassName.Chevron} aria-hidden />}
        <span className="min-w-0 wrap-anywhere">{threat.title}</span>
      </span>
    </>
  );
}

function ThreatRow({ threat }: Readonly<{ threat: CycloneThreat }>) {
  if (threat.impacts.length === 0) {
    return <div className={HazardClassName.ThreatRow}><ThreatHeader threat={threat} expandable={false} /></div>;
  }
  return (
    <details className={HazardClassName.Group}>
      <summary className={`${HazardClassName.ThreatRow} ${HazardClassName.Disclosure}`}>
        <ThreatHeader threat={threat} expandable />
      </summary>
      <div className="px-3 pb-3">
        <ImpactList impacts={threat.impacts} />
      </div>
    </details>
  );
}

/** Worst NWS threat level near the storm for wind, surge, flooding rain, and tornadoes. */
export function CycloneThreatList({ threats }: Readonly<{ threats: readonly CycloneThreat[] }>) {
  return (
    <div className="divide-y divide-sig-border">
      {threats.map((threat) => <ThreatRow key={threat.kind} threat={threat} />)}
    </div>
  );
}

function SurgeRows({ areas }: Readonly<{ areas: readonly CycloneSurgeArea[] }>) {
  return (
    <div className={HazardClassName.Row}>
      {areas.map((area) => (
        <SurgeRow key={area.area} area={area} />
      ))}
    </div>
  );
}

function SurgeRow({ area }: Readonly<{ area: CycloneSurgeArea }>) {
  return (
    <>
      <span className={`${HazardClassName.Wrap} ${DossierTextClass.Value}`}>{area.area}</span>
      <span className={`${HazardClassName.Wrap} text-(length:--sig-text-sm) font-mono text-(--dossier-accent)`}>{area.range}</span>
    </>
  );
}

/** NHC peak storm surge ranges by coastal area, highest first. */
export function CycloneSurgeList({ areas }: Readonly<{ areas: readonly CycloneSurgeArea[] }>) {
  const shown = areas.slice(0, SURGE_ROWS_SHOWN);
  const rest = areas.slice(SURGE_ROWS_SHOWN);
  return (
    <div className="flex flex-col gap-2">
      <SurgeRows areas={shown} />
      {rest.length > 0 && (
        <MoreToggle title={`${rest.length} MORE ${rest.length === 1 ? "AREA" : "AREAS"}`}>
          <SurgeRows areas={rest} />
        </MoreToggle>
      )}
    </div>
  );
}

function bandAt(chances: CycloneWindChances, position: GeoPoint): string | null {
  const band = chances.bands.findLast((candidate) =>
    candidate.rings.some((ring) => ringContainsPoint(position, ring)));
  return band?.band ?? null;
}

function bandDeciles(band: string): number {
  const upper = Math.max(...(band.match(BAND_DIGITS) ?? []).map(Number));
  return Number.isFinite(upper) ? Math.round(upper / PERCENT_DECILE) : 0;
}

function bandText(band: string): string {
  return band.endsWith(PERCENT_SIGN) ? band : `${band}${PERCENT_SIGN}`;
}

function ChanceRow({ chances, position }: Readonly<{ chances: CycloneWindChances; position: GeoPoint }>) {
  const band = bandAt(chances, position);
  if (!band) return null;
  return (
    <>
      <DossierLabel>{formatKtShort(chances.thresholdKt)}+</DossierLabel>
      <span className={`${HazardClassName.Wrap} ${DossierTextClass.Value}`}>{bandText(band)}</span>
      <div className="col-span-2">
        <Meter filled={bandDeciles(band)} total={PERCENT_DECILE} toneClass="text-(--dossier-accent)" />
      </div>
    </>
  );
}

function ArrivalRow({ label, lines }: Readonly<{ label: string; lines: CycloneArrivals[CycloneArrivalKind] }>): ReactNode {
  const first = lines?.[0]?.label;
  const last = lines?.at(-1)?.label;
  if (!first || !last) return null;
  return (
    <>
      <DossierLabel>{label}</DossierLabel>
      <span className={`${HazardClassName.Wrap} ${DossierTextClass.Value}`}>{first === last ? first : `${first} → ${last}`}</span>
    </>
  );
}

/** NHC chance of each wind threshold at a location, and when tropical-storm winds arrive. */
export function CycloneWindChancePanel({ chances, arrival, position }: Readonly<{
  chances: readonly CycloneWindChances[];
  arrival: CycloneArrivals;
  position: GeoPoint | null;
}>) {
  return (
    <div className="flex flex-col divide-y divide-dashed divide-sig-border *:py-3 *:first:pt-0 *:last:pb-0">
      {position && chances.some((threshold) => bandAt(threshold, position)) && (
        <div className={HazardClassName.Row}>
          {chances.map((threshold) => <ChanceRow key={threshold.thresholdKt} chances={threshold} position={position} />)}
        </div>
      )}
      <div className={HazardClassName.Row}>
        <ArrivalRow label="TS WINDS EARLIEST" lines={arrival[CycloneArrivalKind.Earliest]} />
        <ArrivalRow label="TS WINDS MOST LIKELY" lines={arrival[CycloneArrivalKind.MostLikely]} />
      </div>
    </div>
  );
}
