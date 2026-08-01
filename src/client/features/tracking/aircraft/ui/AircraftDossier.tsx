import type { SelectedIsolateMode } from "@/workers/render/protocol";
import { useEffect, useState } from "react";
import { Plane, ExternalLink, LocateFixed } from "lucide-react";
import type {
  AircraftPoint,
} from "@/features/tracking/aircraft/data/codec";
import { formatLat, formatLon } from "@/lib/format/geoFormat";
import { useTrail } from "@/features/base/useTrail";
import { useAircraftDossier } from "../hooks/useAircraftDossier";
import { Domain } from "@shared/domain/identity";
import { SquawkStatus } from "@shared/domain/aircraft";
import { GeoMeasurement, TurnDeg } from "@shared/geo";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { useAircraftPhoto } from "../hooks/useAircraftPhoto";
import { AircraftRouteMap } from "./AircraftRouteMap";
import { RouteProgress } from "./RouteProgress";
import { AircraftIdentityTicket } from "./AircraftIdentityTicket";
import { AircraftTelemetryPFD } from "./AircraftTelemetryPFD";
import {
  aircraftDelayTone,
  AircraftChipTone,
  type AircraftChip,
  Card,
  Label,
  RouteEndpoint,
  SectionLabel,
  StatCell,
} from "./dossierKit";
import {
  ktToMph,
  metersPerSecondToFeetPerMinute,
} from "@/measurements";
import { isaTempC, machFromGs } from "../utils";
import {
  getSquawkStatus,
  sourceLabel,
  windComponents,
} from "@/features/tracking/aircraft/lib/utils";
import {
  AircraftRouteSource,
  aircraftAirportCode,
} from "@shared/domain/aircraftDossier";
import { DossierFallback } from "@/panes/dossier/dossierFallback";
import {
  DossierToolbar,
  formatEpoch,
  useDossierFocus,
} from "@/panes/dossier/DossierAtoms";
import { AircraftDataLabel } from "../types";

type Props = {
  readonly item: AircraftPoint;
  readonly isolateMode: SelectedIsolateMode;
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

enum AircraftDossierLabel {
  Military = "MIL",
  OnTime = "ON TIME",
  Reconnaissance = "RECON",
}

enum AircraftDossierClassName {
  SectionSpacing = "mt-2",
}

enum AircraftWindPrefix {
  Headwind = "H",
  Tailwind = "T",
}

enum AircraftDriftSide {
  Left = "L",
  Right = "R",
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

function verticalSpeedFeet(
  verticalRate: number | undefined,
): number {
  return verticalRate != null
    ? Math.round(metersPerSecondToFeetPerMinute(verticalRate))
    : 0;
}

function hasEmergencySquawk(
  squawk: string | undefined,
): boolean {
  return squawk
    ? getSquawkStatus(squawk) !== SquawkStatus.Normal
    : false;
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

function isaText(
  outsideAirTemperature: number | undefined,
  altitude: number,
): string | null {
  if (typeof outsideAirTemperature !== "number") return null;
  const deviation = Math.round(
    outsideAirTemperature - isaTempC(altitude),
  );
  const sign = deviation >= 0 ? "+" : "";
  return `ISA ${sign}${deviation}`;
}

function windComponentText(
  windDirection: number | undefined,
  windSpeed: number | undefined,
  heading: number,
): string | null {
  const component = windComponents(
    windDirection,
    windSpeed,
    heading,
  );
  if (!component) return null;
  const alongTrack = component.head >= 0
    ? `${AircraftWindPrefix.Headwind}${component.head}`
    : `${AircraftWindPrefix.Tailwind}${Math.abs(component.head)}`;
  return `${alongTrack} · X${component.cross}${component.side}`;
}

function aircraftDriftText(
  heading: number,
  trueHeading: number | undefined,
): string | null {
  if (typeof trueHeading !== "number") return null;
  let difference = heading - trueHeading;
  while (difference > TurnDeg.Half) difference -= TurnDeg.Full;
  while (difference < -TurnDeg.Half) difference += TurnDeg.Full;
  if (Math.abs(difference) < 1) return "0°";
  const side = difference > 0
    ? AircraftDriftSide.Right
    : AircraftDriftSide.Left;
  return `${Math.abs(Math.round(difference))}° ${side}`;
}

function aircraftIntelLinks(
  callsign: string,
  icao24: string,
  registration: string,
): Array<readonly [string, string]> {
  const links: Array<readonly [string, string]> = [];
  if (callsign.trim()) {
    links.push(
      [
        "FlightAware",
        `https://flightaware.com/live/flight/${callsign.trim()}`,
      ],
      [
        "FlightRadar24",
        `https://www.flightradar24.com/${callsign.trim()}`,
      ],
    );
  }
  links.push(
    ["ADS-B Exchange", `https://globe.adsbexchange.com/?icao=${icao24}`],
    ["Planespotters", `https://www.planespotters.net/hex/${icao24.toUpperCase()}`],
  );
  if (registration) {
    links.push([
      "JetPhotos",
      `https://www.jetphotos.com/registration/${registration}`,
    ]);
  }
  return links;
}

export function AircraftDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const dossier = useAircraftDossier(item.id);
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
    squawk,
    onGround,
    originCountry = "",
    verticalRate,
    registration: liveReg,
    operator: liveOp,
    operatorIcao,
    model: liveModel,
    manufacturerName: liveMfr,
    acType: liveAcType,
    categoryDescription,
    military: isMilitary,
    recon: isRecon,
    mach,
    trueHeading,
    tas,
    windDir,
    windSpd,
    oat,
    tat,
    navQnh,
    navModes,
    navHeading,
    navAltitudeMcp,
    navAltitudeFms,
    rssi,
    nacP,
    adsbType,
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
  const modelFamily = displayModel.split(/[\s/-]/)[0] ?? "";
  const typeBadge = modelFamily.length >= 3 ? modelFamily : acTypeShort;
  const owner =
    dossier?.aircraft?.RegisteredOwners ?? liveOp ?? operatorIcao ?? "";
  const { route } = dossier ?? {};

  const speedFooter = `${ktToMph(speed)} mph`;
  const fpm = verticalSpeedFeet(verticalRate);
  const emergency = hasEmergencySquawk(squawk);
  const wake = wakeCategory(categoryDescription);
  const selectedAlt = navAltitudeMcp ?? navAltitudeFms;

  const speedText = aircraftSpeedText(mach, tas, speed, altitude);
  const machText = speedText.mach;
  const tasText = speedText.tas;
  const isaDisplay = isaText(oat, altitude);
  const tatText = typeof tat === "number" ? `${Math.round(tat)}°C` : null;
  const windCompText = windComponentText(windDir, windSpd, heading);
  const driftText = aircraftDriftText(heading, trueHeading);
  const rssiText = typeof rssi === "number" ? `${Math.round(rssi)} dB` : null;
  const accText = typeof nacP === "number" ? `${nacP}` : null;
  const sourceText = sourceLabel(adsbType);

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

  const links = aircraftIntelLinks(callsign, icao24, reg);

  const coords = (
    <div className="flex items-center justify-between bg-sig-panel border border-sig-border rounded-[10px] px-3 py-1.5">
      <span className="flex items-center gap-1.5 text-(length:--sig-text-xs) text-sig-text">
        <LocateFixed className="w-3.5 h-3.5 text-(--dossier-accent)" aria-hidden={true} />
        POSITION
      </span>
      <span className="text-(length:--sig-text-xs) text-sig-bright font-mono">
        {formatLat(recordLatitude(item))} · {formatLon(recordLongitude(item))}
      </span>
    </div>
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
            <SectionLabel>FLIGHT PLAN</SectionLabel>
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
              {route.distance != null && <StatCell label="DIST nm" value={String(route.distance)} />}
              {route.filedAltitude != null && (
                <StatCell label="FILED ALT" value={`FL${route.filedAltitude / GeoMeasurement.FeetPerFlightLevel}`} />
              )}
              {route.filedSpeed != null && <StatCell label="FILED kn" value={String(route.filedSpeed)} />}
            </div>
            {route.filedRoute && (
              <Card className={`p-2.5 ${AircraftDossierClassName.SectionSpacing}`}>
                <Label className="mb-1.5">FILED ROUTE</Label>
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
              </Card>
            )}
            {route.source === AircraftRouteSource.HexDb && (
              <div className="text-(length:--sig-text-xs) text-sig-dim/60 mt-1">
                * Last known route; may not reflect current flight
              </div>
            )}
          </section>
        )}

        <section className="sec route min-w-0 flex flex-col">
          <SectionLabel>ROUTE</SectionLabel>
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
          <div className={AircraftDossierClassName.SectionSpacing}>{coords}</div>
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
          <SectionLabel>LIVE TELEMETRY</SectionLabel>
          <AircraftTelemetryPFD
            speed={speed}
            speedFooter={speedFooter}
            heading={heading}
            selectedHeading={navHeading}
            altitude={altitude}
            selectedAlt={selectedAlt}
            onGround={onGround}
            fpm={fpm}
            squawk={squawk}
            emergency={emergency}
            windDir={windDir}
            windSpd={windSpd}
            oat={oat}
            navQnh={navQnh}
            navModes={navModes}
            windCompText={windCompText}
            isaText={isaDisplay}
            tatText={tatText}
            rssiText={rssiText}
            accText={accText}
            sourceText={sourceText}
            driftText={driftText}
          />
        </section>
      </div>

      <section className="intel">
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
