import { IntelSeverity } from "@shared/domain/correlation";
import {
  aircraftReconNickname,
  squawkStatusFor,
  SquawkStatus,
  type AircraftData,
} from "@shared/domain/aircraft";
import { EMPTY_TEXT } from "@shared/text";
import { metersPerSecondToFeetPerMinute } from "@/measurements";
import {
  emptyFeatureFeedPresentation,
  FeatureTableAbbreviation,
  type FeatureFeedPresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";

export enum AircraftDataLabel {
  Unknown = "Unknown",
  UnknownCallsign = "UNK",
  UnknownOrigin = "UNK ORIGIN",
  UnknownOperator = "UNK OP",
  UnknownUppercase = "UNKNOWN",
}

export enum AircraftFlightStatusLabel {
  Airborne = "AIRBORNE",
  Ground = "GROUND",
  OnGround = "ON GROUND",
}

export enum AircraftLinkSurface {
  Detail = "detail",
  Dossier = "dossier",
}

export enum AircraftLinkProvider {
  AdsbExchange = "adsb_exchange",
  FlightAware = "flightaware",
  FlightRadar24 = "flightradar24",
  JetPhotos = "jetphotos",
  PlaneSpotters = "planespotters",
}

export const AIRCRAFT_LINK_POLICIES: Readonly<
  Record<
    AircraftLinkProvider,
    Readonly<{
      label: string;
      surfaces: readonly AircraftLinkSurface[];
      buildUrl: (data: AircraftData) => string | null;
    }>
  >
> = {
  [AircraftLinkProvider.AdsbExchange]: {
    label: "ADS-B Exchange",
    surfaces: [AircraftLinkSurface.Detail, AircraftLinkSurface.Dossier],
    buildUrl: ({ icao24 }) => {
      const hex = icao24?.trim();
      return hex ? `https://globe.adsbexchange.com/?icao=${hex}` : null;
    },
  },
  [AircraftLinkProvider.FlightAware]: {
    label: "FlightAware",
    surfaces: [AircraftLinkSurface.Detail, AircraftLinkSurface.Dossier],
    buildUrl: ({ callsign }) => {
      const flight = callsign?.trim();
      return flight ? `https://flightaware.com/live/flight/${flight}` : null;
    },
  },
  [AircraftLinkProvider.FlightRadar24]: {
    label: "FlightRadar24",
    surfaces: [AircraftLinkSurface.Detail, AircraftLinkSurface.Dossier],
    buildUrl: ({ callsign }) => {
      const flight = callsign?.trim();
      return flight ? `https://www.flightradar24.com/${flight}` : null;
    },
  },
  [AircraftLinkProvider.JetPhotos]: {
    label: "JetPhotos",
    surfaces: [AircraftLinkSurface.Dossier],
    buildUrl: ({ registration }) => {
      const tail = registration?.trim();
      return tail ? `https://www.jetphotos.com/registration/${tail}` : null;
    },
  },
  [AircraftLinkProvider.PlaneSpotters]: {
    label: "Planespotters",
    surfaces: [AircraftLinkSurface.Dossier],
    buildUrl: ({ icao24 }) => {
      const hex = icao24?.trim().toUpperCase();
      return hex ? `https://www.planespotters.net/hex/${hex}` : null;
    },
  },
};

export function aircraftSearchText(data: AircraftData): string {
  return [
    data.callsign,
    data.icao24,
    data.acType,
    data.registration,
    data.operator,
    data.manufacturerName,
    data.model,
    data.categoryDescription,
    data.originCountry,
    data.squawk,
    data.military ? "military mil" : EMPTY_TEXT,
    data.recon
      ? `recon hurricane hunter ${aircraftReconNickname(data)}`
      : EMPTY_TEXT,
  ].filter(Boolean).join(" ");
}

export function aircraftBadgePresentation(data: AircraftData): Readonly<{
  operator: string;
  subtitle: string;
  typeBadge: string;
}> {
  const operator = data.operator ||
    data.operatorIcao ||
    data.registration ||
    AircraftDataLabel.Unknown;
  const subtitle = [data.callsign?.trim(), data.registration]
    .filter(Boolean)
    .join(" · ");
  const family = (data.model ?? EMPTY_TEXT).split(/[\s/-]/)[0] ?? EMPTY_TEXT;
  return {
    operator,
    subtitle,
    typeBadge: family.length >= 3 ? family : data.acType ?? EMPTY_TEXT,
  };
}

export function aircraftEmergencyPresentation(
  data: AircraftData,
): Readonly<{
  active: boolean;
  label: string;
  status: SquawkStatus;
}> {
  const status = squawkStatusFor(data.squawk);
  return {
    active: data.squawk !== undefined && status !== SquawkStatus.Normal,
    label: data.squawk ? `${data.squawk} EMERG` : EMPTY_TEXT,
    status,
  };
}

export function aircraftVerticalSpeedFpm(
  verticalRate: number | undefined,
): number {
  return verticalRate === undefined
    ? 0
    : Math.round(metersPerSecondToFeetPerMinute(verticalRate));
}

export function aircraftExternalLinks(
  data: AircraftData,
  surface: AircraftLinkSurface,
): Array<[string, string]> {
  const links: Array<[string, string]> = [];
  for (const provider of Object.values(AircraftLinkProvider)) {
    const policy = AIRCRAFT_LINK_POLICIES[provider];
    if (!policy.surfaces.includes(surface)) continue;
    const url = policy.buildUrl(data);
    if (url) links.push([policy.label, url]);
  }
  return links;
}

export function aircraftTablePresentation(
  data: AircraftData,
  id: string,
): FeatureTablePresentation {
  const callsign = data.callsign?.trim() ?? EMPTY_TEXT;
  const altitude = data.altitude;
  return {
    abbreviation: FeatureTableAbbreviation.Aircraft,
    classification: data.acType ?? EMPTY_TEXT,
    classificationRank: 0,
    detail: altitude == null ? EMPTY_TEXT : `${altitude.toLocaleString()} ft`,
    detailRank: altitude ?? 0,
    name: callsign || data.icao24 || id,
  };
}

export function aircraftFeedPresentation(
  _data: AircraftData,
  id: string,
): FeatureFeedPresentation {
  return emptyFeatureFeedPresentation(id, IntelSeverity.Monitoring);
}
