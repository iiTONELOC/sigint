import { Domain } from "./identity";
import type { GeoPoint } from "../geo";
import { isNumberEnumValue } from "../types/enum";

export enum AisNavigationStatus {
  UnderWayUsingEngine = 0,
  AtAnchor = 1,
  NotUnderCommand = 2,
  RestrictedManeuverability = 3,
  ConstrainedByDraught = 4,
  Moored = 5,
  Aground = 6,
  Fishing = 7,
  UnderWaySailing = 8,
  ReservedHighSpeedCraft = 9,
  ReservedWingInGround = 10,
  TowingAstern = 11,
  PushingOrTowing = 12,
  Reserved = 13,
  SearchAndRescueTransponder = 14,
  NotDefined = 15,
}

export enum AisRateOfTurn {
  Unavailable = -128,
  Steady = 0,
  HardTurn = 127,
}

export enum AisShipType {
  WIG = 20,
  Fishing = 30,
  Towing = 31,
  TowingLarge = 32,
  Dredging = 33,
  DivingOps = 34,
  MilitaryOps = 35,
  Sailing = 36,
  PleasureCraft = 37,
  HSC = 40,
  PilotVessel = 50,
  SAR = 51,
  Tug = 52,
  PortTender = 53,
  AntiPollution = 54,
  LawEnforcement = 55,
  Medical = 58,
  Noncombatant = 59,
  Passenger = 60,
  Cargo = 70,
  Tanker = 80,
  Other = 90,
}

export type ShipData = {
  mmsi: number;
  imo?: number;
  name?: string;
  callSign?: string;
  shipTypeCode?: number;
  sog?: number;
  cog?: number;
  heading?: number;
  navStatus?: AisNavigationStatus;
  rot?: number;
  destination?: string;
  draught?: number;
  eta?: string;
  dimA?: number;
  dimB?: number;
  dimC?: number;
  dimD?: number;
};

export type AisVesselRecord = ShipData & {
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  heading: number;
  navStatus: AisNavigationStatus;
  lastSeen: number;
};

export type ShipPoint = Readonly<{
  id: string;
  type: Domain.Ships;
  position: GeoPoint;
  timestamp?: string;
  data: ShipData;
}>;

export type ShipServerPayload = Readonly<{
  vessels: readonly AisVesselRecord[];
  vesselCount: number;
  connected: boolean;
}>;

export type ShipNavigationMetadata = Readonly<{
  fullLabel: string;
  compactLabel: string;
  alert: boolean;
}>;

export type ShipDimensions = Readonly<{
  length?: number;
  beam?: number;
}>;

export const AIS_HEADING_UNAVAILABLE = 511;
export const SHIPS_LATEST_ROUTE = "/api/ships/latest";
export const SHIP_DATA_UNAVAILABLE_MESSAGE = "No AIS data available yet";
export const SHIP_UNKNOWN_LABEL = "Unknown";

const UNKNOWN_NAVIGATION_LABEL = SHIP_UNKNOWN_LABEL.toUpperCase();
const AIS_SART_LABEL = "AIS-SART";

export const SHIP_NAVIGATION_METADATA = {
  [AisNavigationStatus.UnderWayUsingEngine]: {
    fullLabel: "Under way using engine", compactLabel: "UNDER WAY", alert: false,
  },
  [AisNavigationStatus.AtAnchor]: { fullLabel: "At anchor", compactLabel: "AT ANCHOR", alert: false },
  [AisNavigationStatus.NotUnderCommand]: { fullLabel: "Not under command", compactLabel: "NOT UNDER CMD", alert: true },
  [AisNavigationStatus.RestrictedManeuverability]: { fullLabel: "Restricted manoeuvrability", compactLabel: "RESTRICTED", alert: true },
  [AisNavigationStatus.ConstrainedByDraught]: { fullLabel: "Constrained by draught", compactLabel: "CONSTRAINED", alert: true },
  [AisNavigationStatus.Moored]: { fullLabel: "Moored", compactLabel: "MOORED", alert: false },
  [AisNavigationStatus.Aground]: { fullLabel: "Aground", compactLabel: "AGROUND", alert: true },
  [AisNavigationStatus.Fishing]: { fullLabel: "Engaged in fishing", compactLabel: "FISHING", alert: false },
  [AisNavigationStatus.UnderWaySailing]: { fullLabel: "Under way sailing", compactLabel: "UNDER SAIL", alert: false },
  [AisNavigationStatus.ReservedHighSpeedCraft]: { fullLabel: "Reserved (HSC)", compactLabel: UNKNOWN_NAVIGATION_LABEL, alert: false },
  [AisNavigationStatus.ReservedWingInGround]: { fullLabel: "Reserved (WIG)", compactLabel: UNKNOWN_NAVIGATION_LABEL, alert: false },
  [AisNavigationStatus.TowingAstern]: { fullLabel: "Power-driven towing astern", compactLabel: "TOWING ASTERN", alert: false },
  [AisNavigationStatus.PushingOrTowing]: { fullLabel: "Power-driven pushing/towing", compactLabel: "PUSHING/TOWING", alert: false },
  [AisNavigationStatus.Reserved]: { fullLabel: "Reserved", compactLabel: UNKNOWN_NAVIGATION_LABEL, alert: false },
  [AisNavigationStatus.SearchAndRescueTransponder]: { fullLabel: AIS_SART_LABEL, compactLabel: AIS_SART_LABEL, alert: true },
  [AisNavigationStatus.NotDefined]: { fullLabel: "Not defined", compactLabel: UNKNOWN_NAVIGATION_LABEL, alert: false },
} satisfies Readonly<Record<AisNavigationStatus, ShipNavigationMetadata>>;

export const MMSI_COUNTRY_BY_MID: Readonly<Record<number, string>> = {
  201: "AL", 202: "AD", 203: "AT", 204: "PT", 205: "BE", 206: "BY",
  207: "BG", 209: "CY", 210: "CY", 211: "DE", 212: "CY", 213: "GE",
  214: "MD", 215: "MT", 216: "AM", 218: "DE", 219: "DK", 220: "DK",
  224: "ES", 225: "ES", 226: "FR", 227: "FR", 228: "FR", 229: "MT",
  230: "FI", 231: "FO", 232: "GB", 233: "GB", 234: "GB", 235: "GB",
  236: "GI", 237: "GR", 238: "HR", 239: "GR", 240: "GR", 241: "GR",
  242: "MA", 243: "HU", 244: "NL", 245: "NL", 246: "NL", 247: "IT",
  248: "MT", 249: "MT", 250: "IE", 251: "IS", 253: "LU", 255: "PT",
  256: "MT", 257: "NO", 258: "NO", 259: "NO", 261: "PL", 263: "PT",
  264: "RO", 265: "SE", 266: "SE", 267: "SK", 269: "CH", 270: "CZ",
  271: "TR", 272: "UA", 273: "RU", 275: "LV", 276: "EE", 277: "LT",
  278: "SI", 279: "ME", 303: "US", 306: "CW", 307: "AW", 308: "BS",
  310: "BM", 312: "BZ", 314: "BB", 316: "CA", 319: "KY", 321: "CR",
  323: "CU", 325: "DM", 327: "DO", 330: "GD", 331: "GL", 332: "GT",
  334: "HN", 336: "HT", 338: "US", 339: "JM", 345: "MX", 350: "NI",
  351: "PA", 352: "PA", 353: "PA", 354: "PA", 355: "PA", 356: "PA",
  357: "PA", 358: "PR", 359: "SV", 362: "TT", 366: "US", 367: "US",
  368: "US", 369: "US", 370: "PA", 371: "PA", 372: "PA", 373: "PA",
  374: "PA", 401: "AF", 403: "SA", 405: "BD", 410: "BT", 412: "CN",
  413: "CN", 414: "CN", 416: "TW", 417: "LK", 419: "IN", 422: "IR",
  425: "IQ", 428: "IL", 431: "JP", 432: "JP", 436: "KZ", 438: "JO",
  440: "KR", 441: "KR", 447: "KW", 450: "LB", 457: "MN", 461: "OM",
  463: "PK", 466: "QA", 468: "SY", 470: "AE", 473: "YE", 475: "TH",
  477: "HK", 501: "AQ", 503: "AU", 506: "MM", 512: "NZ", 525: "ID",
  533: "MY", 538: "MH", 548: "PH", 553: "PG", 563: "SG", 564: "SG",
  565: "SG", 566: "SG", 574: "VN", 576: "VU", 601: "ZA", 603: "AO",
  605: "DZ", 622: "EG", 624: "ET", 626: "GA", 627: "GH", 634: "KE",
  636: "LR", 637: "LR", 657: "NG", 659: "NA", 672: "TN", 674: "TZ",
  675: "UG", 678: "ZM", 679: "ZW",
};

export function mmsiCountry(mmsi: number): string | null {
  if (!Number.isSafeInteger(mmsi) || mmsi <= 0) return null;
  return MMSI_COUNTRY_BY_MID[Math.floor(mmsi / 1_000_000)] ?? null;
}

export function shipDimensions(data: ShipData): ShipDimensions {
  const length = (data.dimA ?? 0) + (data.dimB ?? 0);
  const beam = (data.dimC ?? 0) + (data.dimD ?? 0);
  return {
    ...(length > 0 ? { length } : {}),
    ...(beam > 0 ? { beam } : {}),
  };
}

export function shipNavigationMetadata(
  status: number | undefined,
): ShipNavigationMetadata {
  return isNumberEnumValue(status, AisNavigationStatus)
    ? SHIP_NAVIGATION_METADATA[status]
    : SHIP_NAVIGATION_METADATA[AisNavigationStatus.NotDefined];
}

/** AIS groups vessel types by decade; the decade's first code names it. */
enum AisShipTypeBlock {
  SpanCodes = 10,
}

function shipTypeCategory(code: number): AisShipType | null {
  if (isNumberEnumValue(code, AisShipType)) return code;
  if (code > AisShipType.Other) return AisShipType.Other;
  const block =
    Math.floor(code / AisShipTypeBlock.SpanCodes) * AisShipTypeBlock.SpanCodes;
  return isNumberEnumValue(block, AisShipType) ? block : null;
}

export function shipTypeLabel(code: number | undefined): string {
  if (code === undefined || !Number.isFinite(code)) {
    return SHIP_UNKNOWN_LABEL;
  }
  const category = shipTypeCategory(code);
  return category === null
    ? SHIP_UNKNOWN_LABEL
    : AisShipType[category].replace(/([a-z])([A-Z])/g, "$1 $2");
}
