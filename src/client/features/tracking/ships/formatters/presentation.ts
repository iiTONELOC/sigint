import { IntelSeverity } from "@shared/domain/correlation";
import { EMPTY_TEXT } from "@shared/text";
import {
  emptyFeatureFeedPresentation,
  FeatureTableAbbreviation,
  type FeatureFeedPresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";
import {
  AisNavigationStatus,
  mmsiCountry,
  shipNavigationMetadata,
  shipTypeLabel,
  SHIP_UNKNOWN_LABEL,
  type ShipData,
  type ShipNavigationMetadata,
} from "@shared/domain/ships";
import {
  formatShipCourse,
  formatShipDraught,
  formatShipDrift,
  formatShipHeading,
  formatShipSpeed,
  setDrift,
} from "./navigation";

export type ShipPresentation = FeatureTablePresentation & Readonly<{
  callSignText: string;
  courseText: string;
  description: string;
  destinationText: string;
  draughtText: string;
  driftText: string;
  etaText: string;
  headingText: string;
  imoValue: number | string;
  navigation: ShipNavigationMetadata;
  searchText: string;
  speedText: string;
  vesselType: string | null;
}>;

export function shipPresentation(
  data: ShipData, fallbackName: string, unavailable?: string,
): ShipPresentation {
  const fallback = unavailable ?? EMPTY_TEXT;
  const classification = shipTypeLabel(data.shipTypeCode);
  const vesselType =
    classification === SHIP_UNKNOWN_LABEL ? null : classification;
  const speed = data.sog;
  const drift = setDrift(data.heading, data.cog);
  return {
    abbreviation: FeatureTableAbbreviation.Ships,
    callSignText: data.callSign || fallback,
    classification,
    classificationRank: 0,
    courseText: formatShipCourse(data.cog, fallback),
    description: [vesselType, mmsiCountry(data.mmsi)].filter(Boolean).join(" · "),
    destinationText: data.destination || fallback,
    detail: speed === undefined ? EMPTY_TEXT : `${speed.toFixed(1)} kn`,
    detailRank: speed ?? 0,
    draughtText: formatShipDraught(data.draught, fallback),
    driftText: formatShipDrift(drift, fallback),
    etaText: data.eta || fallback,
    headingText: formatShipHeading(data.heading, fallback),
    imoValue:
      data.imo !== undefined && data.imo > 0 ? data.imo : fallback,
    name: data.name || fallbackName,
    navigation: shipNavigationMetadata(data.navStatus),
    searchText: [data.name, String(data.mmsi),
      data.imo === undefined ? undefined : String(data.imo),
      data.callSign, classification, data.destination,
    ].filter(Boolean).join(" "),
    speedText: formatShipSpeed(speed, fallback),
    vesselType,
  };
}

export function shipAnomalies(
  navStatus: AisNavigationStatus | undefined,
  sog: number | undefined,
): string[] {
  const speed = sog ?? 0;
  const stationarySpeedLimitKnots = 1;
  const fishingSpeedLimitKnots = 8;
  if (
    navStatus === AisNavigationStatus.Moored &&
    speed > stationarySpeedLimitKnots
  ) {
    return [`Moored but making ${speed.toFixed(1)} kn`];
  }
  if (
    navStatus === AisNavigationStatus.AtAnchor &&
    speed > stationarySpeedLimitKnots
  ) {
    return [`At anchor but making ${speed.toFixed(1)} kn`];
  }
  if (
    navStatus === AisNavigationStatus.Fishing &&
    speed > fishingSpeedLimitKnots
  ) {
    return [`Fishing at ${speed.toFixed(1)} kn; unusually fast`];
  }
  const metadata = shipNavigationMetadata(navStatus);
  return (
    navStatus !== undefined &&
    navStatus !== AisNavigationStatus.SearchAndRescueTransponder &&
    metadata.alert
  ) ? [metadata.fullLabel] : [];
}

export function shipFeedPresentation(
  _data: ShipData,
  id: string,
): FeatureFeedPresentation {
  return emptyFeatureFeedPresentation(id, IntelSeverity.Monitoring);
}
