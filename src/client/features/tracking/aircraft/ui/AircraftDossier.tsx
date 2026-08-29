import { useEffect, useState } from "react";
import { Plane } from "lucide-react";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { useTrail } from "@/features/base/useTrail";
import { useAircraftDossier } from "../hooks/useAircraftDossier";
import { Domain } from "@shared/domain/identity";
import { GeoMeasurement } from "@shared/geo";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { useAircraftPhoto } from "../hooks/useAircraftPhoto";
import { AircraftRouteMap } from "./AircraftRouteMap";
import { RouteProgress } from "./RouteProgress";
import {
  AircraftChipTone,
  AircraftIdentityTicket,
  type AircraftChip,
} from "./AircraftIdentityTicket";
import { AircraftTelemetryPFD } from "./AircraftTelemetryPFD";
import {
  DossierCard,
  DossierLabel,
  DossierLinkGrid,
  DossierPositionRow,
  DossierSectionLabel,
  DossierStatCell,
  DossierToolbar,
  useDossierFocus,
} from "@/dossier";
import { machFromGs } from "../utils/isa";
import {
  AircraftRouteSource,
  aircraftAirportCode,
} from "@shared/domain/aircraftDossier";
import { DossierFallback } from "@/panes/dossier/dossierFallback";
import {
  aircraftBadgePresentation,
  AircraftDataLabel,
  aircraftExternalLinks,
  AircraftLinkSurface,
} from "../formatters/presentation";

type Props = FeatureDossierProps<Domain.Aircraft>;

enum AircraftDossierLabel {
  Military = "MIL",
  OnTime = "ON TIME",
  Reconnaissance = "RECON",
}

enum AircraftDossierClassName {
  SectionSpacing = "mt-2",
}

enum AircraftDelayMinutes {
  OnTimeMaximum = 0,
  WarningMaximum = 15,
  LateMaximum = 60,
}

enum AircraftEpochMetric {
  MillisecondsPerSecond = 1000,
}

enum AircraftTimeFieldFormat {
  TwoDigit = "2-digit",
}

type RouteEndpointProps = Readonly<{
  actual?: boolean;
  gate?: string;
  label: string;
  late?: boolean;
  name: string;
  time?: string;
}>;

function aircraftDelayTone(minutes: number): AircraftChipTone {
  if (minutes <= AircraftDelayMinutes.OnTimeMaximum) {
    return AircraftChipTone.OnTime;
  }
  if (minutes <= AircraftDelayMinutes.WarningMaximum) {
    return AircraftChipTone.Warning;
  }
  return minutes <= AircraftDelayMinutes.LateMaximum
    ? AircraftChipTone.Late
    : AircraftChipTone.Critical;
}

function formatEpoch(epoch: number): string {
  return new Date(
    epoch * AircraftEpochMetric.MillisecondsPerSecond,
  ).toLocaleTimeString("en-US", {
    hour: AircraftTimeFieldFormat.TwoDigit,
    minute: AircraftTimeFieldFormat.TwoDigit,
    hour12: true,
    timeZoneName: "short",
  });
}

function RouteEndpoint({
  actual,
  gate,
  label,
  late,
  name,
  time,
}: RouteEndpointProps) {
  return (
    <DossierCard className="p-2.5">
      <DossierLabel>{gate ? `${label} · GATE ${gate}` : label}</DossierLabel>
      <div className="text-(length:--sig-text-sm) text-sig-bright mt-1">
        {name}
      </div>
      {time && (
        <div
          className={`text-(length:--sig-text-xs) mt-1 ${late ? "text-sig-warn" : "text-sig-text"}`}
        >
          {time}
          {actual ? "" : " est"}
        </div>
      )}
    </DossierCard>
  );
}

function onTimeChip(
  hasRoute: boolean,
  delay?: string,
): AircraftChip | null {
  if (!hasRoute) return null;
  if (!delay) {
    return {
      label: AircraftDossierLabel.OnTime,
      tone: AircraftChipTone.OnTime,
    };
  }
  const match = /(-?\d+)/.exec(delay);
  const minutes = match ? Number(match[1]) : 0;
  return {
    label: minutes <= 0
      ? AircraftDossierLabel.OnTime
      : `+${minutes}m`,
    tone: aircraftDelayTone(minutes),
  };
}

function roleBadge(
  reconnaissance: boolean | undefined,
  military: boolean | undefined,
): string | null {
  if (reconnaissance) return AircraftDossierLabel.Reconnaissance;
  return military ? AircraftDossierLabel.Military : null;
}

function wakeCategory(category: string | undefined): string | null {
  return category &&
    category !== AircraftDataLabel.UnknownUppercase
    ? category
    : null;
}

function aircraftSpeedText(
  mach: number | undefined,
  tas: number | undefined,
  speed: number,
  altitude: number,
): Readonly<{ mach: string; tas: string }> {
  const reportedMach = typeof mach === "number";
  const machValue = reportedMach
    ? mach
    : machFromGs(speed, altitude);
  const prefix = reportedMach ? "" : "~";
  const trueAirspeed = typeof tas === "number" ? tas : speed;
  return {
    mach: `${prefix}M ${machValue.toFixed(2)}`,
    tas: `${Math.round(trueAirspeed)} kt`,
  };
}

export function AircraftDossier({
  item,
  requestItem,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const requestKey =
    requestItem?.type === Domain.Aircraft ? requestItem : null;
  const dossier = useAircraftDossier(item.id, requestKey);
  const [photoError, setPhotoError] = useState(false);
  useEffect(() => {
    setPhotoError(false);
  }, [item.id]);
  const closeBtnRef = useDossierFocus(item.id);
  const recordedTrail = useTrail(item.id, Domain.Aircraft);

  const acData = item.data;
  const {
    callsign = "",
    icao24 = "",
    altitude = 0,
    speed = 0,
    heading = 0,
    originCountry = "",
    registration: liveReg,
    model: liveModel,
    manufacturerName: liveMfr,
    acType: liveAcType,
    categoryDescription,
    military: isMilitary,
    recon: isRecon,
    mach,
    tas,
  } = acData;

  const { photo, loading: photoLoading } = useAircraftPhoto(icao24, liveReg || undefined);

  const title = callsign?.trim() || icao24.toUpperCase();
  const toolbar = (
    <DossierToolbar
      icon={Plane}
      title={title}
      badge={roleBadge(isRecon, isMilitary)}
      isolateMode={isolateMode}
      onLocate={onLocate}
      onFocus={onFocus}
      onSolo={onSolo}
      onClose={onClose}
      closeButtonRef={closeBtnRef}
    />
  );

  const reg = dossier?.aircraft?.Registration ?? liveReg ?? "";
  const mfr = dossier?.aircraft?.Manufacturer ?? liveMfr ?? "";
  const typeFullName = dossier?.aircraft?.Type ?? "";
  const acTypeShort = liveAcType || (dossier?.aircraft?.ICAOTypeCode ?? "");
  const displayModel = liveModel ?? "";
  const badge = aircraftBadgePresentation({
    ...acData,
    acType: acTypeShort,
    model: displayModel,
    registration: reg,
  });
  const typeBadge = badge.typeBadge;
  const owner = dossier?.aircraft?.RegisteredOwners ?? badge.operator;
  const { route } = dossier ?? {};

  const wake = wakeCategory(categoryDescription);

  const speedText = aircraftSpeedText(mach, tas, speed, altitude);
  const machText = speedText.mach;
  const tasText = speedText.tas;
  const trail = [
    ...recordedTrail,
    {
      lat: recordLatitude(item),
      lon: recordLongitude(item),
      altitude,
      heading,
      speed,
      ts: Date.now(),
    },
  ];

  const originCode = aircraftAirportCode(route?.origin);
  const destCode = aircraftAirportCode(route?.destination);
  const chip = onTimeChip(!!route, route?.delays?.departure);
  const arrLate =
    !!chip && chip.label !== AircraftDossierLabel.OnTime;

  const links = aircraftExternalLinks(
    { ...acData, registration: reg },
    AircraftLinkSurface.Dossier,
  );

  return (
    <div className="@container/dossier h-full flex flex-col">
      {toolbar}
      <div className="flex-1 min-h-0 overflow-auto sigint-scroll p-3 flex flex-col gap-3">
      <div className="grid grid-cols-1 @min-[40rem]/dossier:grid-cols-2 @min-[76rem]/dossier:grid-cols-4 gap-2 items-start @min-[40rem]/dossier:items-stretch">
        <section className="sec identity min-w-0">
          <AircraftIdentityTicket
            photo={photo}
            photoLoading={photoLoading}
            photoError={photoError}
            onPhotoError={() => setPhotoError(true)}
            typeBadge={typeBadge}
            military={!!isMilitary}
            recon={!!isRecon}
            operator={owner}
            chip={chip}
            reg={reg}
            icao24={icao24}
            originCountry={originCountry}
            model={displayModel}
            aircraft={typeFullName}
            mfr={mfr}
            wake={wake}
          />
        </section>

        {route && (
          <section className="sec flightplan min-w-0 flex flex-col">
            <DossierSectionLabel>FLIGHT PLAN</DossierSectionLabel>
            <div className="flex flex-col gap-2">
              <RouteEndpoint
                label="DEPART"
                gate={route.origin?.gate}
                name={route.origin?.name || route.origin?.city || originCode || DossierFallback.Unavailable}
                time={route.departureTime ? formatEpoch(route.departureTime) : undefined}
                actual={route.departureActual}
              />
              <RouteEndpoint
                label="ARRIVE"
                gate={route.destination?.gate}
                name={route.destination?.name || route.destination?.city || destCode || DossierFallback.Unavailable}
                time={route.arrivalTime ? formatEpoch(route.arrivalTime) : undefined}
                actual={route.arrivalActual}
                late={arrLate}
              />
            </div>
            <div className={`grid grid-cols-3 gap-2 ${AircraftDossierClassName.SectionSpacing}`}>
              {route.distance != null && <DossierStatCell label="DIST nm" value={String(route.distance)} />}
              {route.filedAltitude != null && (
                <DossierStatCell label="FILED ALT" value={`FL${route.filedAltitude / GeoMeasurement.FeetPerFlightLevel}`} />
              )}
              {route.filedSpeed != null && <DossierStatCell label="FILED kn" value={String(route.filedSpeed)} />}
            </div>
            {route.filedRoute && (
              <DossierCard className={`p-2.5 ${AircraftDossierClassName.SectionSpacing}`}>
                <DossierLabel className="mb-1.5">FILED ROUTE</DossierLabel>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto sigint-scroll">
                  {route.filedRoute
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((wp, i) => (
                      <span
                        key={`${wp}-${i}`}
                        className="text-(length:--sig-text-xs) font-mono text-sig-text bg-sig-bg/60 border border-sig-border rounded px-1.5 py-0.5"
                      >
                        {wp}
                      </span>
                    ))}
                </div>
              </DossierCard>
            )}
            {route.source === AircraftRouteSource.HexDb && (
              <div className="text-(length:--sig-text-xs) text-sig-dim/60 mt-1">
                * Last known route; may not reflect current flight
              </div>
            )}
          </section>
        )}

        <section className="sec route min-w-0 flex flex-col">
          <DossierSectionLabel>ROUTE</DossierSectionLabel>
          <div className="h-52 @min-[40rem]/dossier:h-auto @min-[40rem]/dossier:flex-1 @min-[40rem]/dossier:min-h-0">
            <AircraftRouteMap
              originCode={originCode}
              destCode={destCode}
              lat={recordLatitude(item)}
              lon={recordLongitude(item)}
              heading={heading}
              waypoints={route?.waypoints}
              trail={trail}
              hud={{
                mach: machText,
                tas: tasText,
                heading: `${Math.round(heading)}°`,
                eta: route?.arrivalTime ? formatEpoch(route.arrivalTime) : undefined,
              }}
            />
          </div>
          <DossierPositionRow
            item={item}
            className={AircraftDossierClassName.SectionSpacing}
          />
          {route && (
            <div className={AircraftDossierClassName.SectionSpacing}>
              <RouteProgress
                origin={originCode}
                dest={destCode}
                departureTime={route.departureTime}
                arrivalTime={route.arrivalTime}
              />
            </div>
          )}
        </section>

        <section className="sec telemetry min-w-0 flex flex-col">
          <DossierSectionLabel>LIVE TELEMETRY</DossierSectionLabel>
          <AircraftTelemetryPFD data={acData} />
        </section>
      </div>

      <section className="intel">
        <DossierSectionLabel>INTEL LINKS</DossierSectionLabel>
        <DossierLinkGrid links={links} />
      </section>
      </div>
    </div>
  );
}
