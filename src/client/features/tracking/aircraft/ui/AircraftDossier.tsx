import { useEffect, useState } from "react";
import { Plane } from "lucide-react";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { useTrail } from "@/features/base/useTrail";
import { useAircraftDossier } from "../hooks/useAircraftDossier";
import { Domain } from "@shared/domain/identity";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { useAircraftPhoto } from "../hooks/useAircraftPhoto";
import { AircraftRouteMap } from "./AircraftRouteMap";
import { RouteProgress } from "./RouteProgress";
import { AircraftIdentityTicket } from "./AircraftIdentityTicket";
import { AircraftTelemetryPFD } from "./AircraftTelemetryPFD";
import { AircraftFlightPlan, delayChip, RouteNextFix } from "./AircraftFlightPlan";
import { AircraftProfileChart } from "./AircraftProfileChart";
import { AircraftStormProximity } from "./AircraftStormProximity";
import {
  DossierCard,
  DossierLinkGrid,
  DossierPositionRow,
  DossierSectionLabel,
  DossierToolbar,
  useDossierFocus,
} from "@/dossier";
import { formatClockTime } from "@/time";
import { formatKtShort } from "@/measurements";
import { machFromGs } from "../utils/isa";
import {
  AircraftFlightEvent,
  aircraftAirportCode,
  eventDelaySeconds,
  routeArrivalTime,
  routeDepartureTime,
} from "@shared/domain/aircraftDossier";
import {
  aircraftBadgePresentation,
  AircraftDataLabel,
  aircraftExternalLinks,
  AircraftLinkSurface,
} from "../formatters/presentation";

type Props = FeatureDossierProps<Domain.Aircraft>;

enum AircraftDossierLabel {
  Military = "MIL",
  Reconnaissance = "RECON",
}

enum AircraftDossierClassName {
  SectionSpacing = "mt-2",
}

function roleBadge(
  reconnaissance: boolean | undefined,
  military: boolean | undefined,
): string | null {
  if (reconnaissance) return AircraftDossierLabel.Reconnaissance;
  return military ? AircraftDossierLabel.Military : null;
}

enum AircraftCategoryPlaceholder {
  NoInformation = "No ADS-B Emitter Category Information",
  Reserved = "Reserved",
}

const CATEGORY_PLACEHOLDERS: ReadonlySet<string> = new Set([
  AircraftDataLabel.UnknownUppercase,
  ...Object.values(AircraftCategoryPlaceholder),
]);

function wakeCategory(category: string | undefined): string | null {
  return category && !CATEGORY_PLACEHOLDERS.has(category) ? category : null;
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
    tas: formatKtShort(Math.round(trueAirspeed)),
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
  const chip = route
    ? delayChip(eventDelaySeconds(route.schedule?.[AircraftFlightEvent.Takeoff]))
    : null;
  const departure = route ? routeDepartureTime(route) : undefined;
  const arrival = route ? routeArrivalTime(route) : undefined;
  const latitude = recordLatitude(item);
  const longitude = recordLongitude(item);

  const links = aircraftExternalLinks(
    { ...acData, registration: reg },
    AircraftLinkSurface.Dossier,
  );

  return (
    <div className="@container/dossier h-full flex flex-col">
      {toolbar}
      <div className="flex-1 min-h-0 overflow-auto sigint-scroll p-3 flex flex-col gap-3">
      <div className="grid grid-cols-1 @min-[40rem]/dossier:grid-cols-2 gap-2 items-start @min-[40rem]/dossier:items-stretch">
        <section className="sec identity min-w-0 flex flex-col">
          <DossierSectionLabel>AIRCRAFT</DossierSectionLabel>
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

        <section className="sec telemetry min-w-0 flex flex-col">
          <DossierSectionLabel>LIVE TELEMETRY</DossierSectionLabel>
          <AircraftTelemetryPFD data={acData} />
        </section>

        {route && <AircraftFlightPlan route={route} />}

        <section className="sec route min-w-0 flex flex-col" aria-label="Route">
          <DossierSectionLabel>ROUTE</DossierSectionLabel>
          <DossierCard className="p-2 flex-1 flex flex-col">
          <div className="flex-1 flex flex-col">
            <AircraftRouteMap
              originCode={originCode}
              destCode={destCode}
              lat={latitude}
              lon={longitude}
              heading={heading}
              waypoints={route?.waypoints}
              trail={trail}
              hud={{
                mach: machText,
                tas: tasText,
                heading: `${Math.round(heading)}°`,
                eta: arrival ? formatClockTime(arrival.time) : undefined,
              }}
            />
          </div>
          <DossierPositionRow
            item={item}
            className={AircraftDossierClassName.SectionSpacing}
          />
          <RouteNextFix
            className={AircraftDossierClassName.SectionSpacing}
            fixes={route?.fixes}
            groundSpeed={speed}
            latitude={latitude}
            longitude={longitude}
          />
          {route && (
            <div className={AircraftDossierClassName.SectionSpacing}>
              <RouteProgress
                origin={originCode}
                dest={destCode}
                departureTime={departure?.time}
                arrivalTime={arrival?.time}
                status={route.status}
              />
            </div>
          )}
          </DossierCard>
        </section>

        {isRecon && <AircraftStormProximity latitude={latitude} longitude={longitude} />}
        <AircraftProfileChart trail={trail} />
      </div>

      <section className="intel">
        <DossierSectionLabel>INTEL LINKS</DossierSectionLabel>
        <DossierLinkGrid links={links} />
      </section>
      </div>
    </div>
  );
}
