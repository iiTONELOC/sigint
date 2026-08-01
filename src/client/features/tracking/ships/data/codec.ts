import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { ktToMps } from "@/measurements";
import { GeoLimit, isRecord } from "@shared/geo";

export type ShipPoint = Extract<DataPoint, { type: Domain.Ships }>;

type ServerVessel = Readonly<{
  mmsi: number;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  heading: number;
  navStatus: number;
  navStatusLabel: string;
  rot?: number;
  lastSeen: number;
  name?: string;
  callSign?: string;
  imo?: number;
  shipType?: number;
  shipTypeLabel?: string;
  destination?: string;
  draught?: number;
  eta?: string;
  length?: number;
  width?: number;
  dimA?: number;
  dimB?: number;
  dimC?: number;
  dimD?: number;
}>;

export type ShipServerPayload = Readonly<{
  vessels: readonly ServerVessel[];
  vesselCount: number;
  connected: boolean;
}>;

export enum ShipNumberField {
  Mmsi = "mmsi",
  Imo = "imo",
  ShipTypeCode = "shipTypeCode",
  Speed = "speed",
  Sog = "sog",
  Cog = "cog",
  Heading = "heading",
  NavStatus = "navStatus",
  Rot = "rot",
  Draught = "draught",
  Length = "length",
  Width = "width",
  DimensionA = "dimA",
  DimensionB = "dimB",
  DimensionC = "dimC",
  DimensionD = "dimD",
  SpeedMetersPerSecond = "speedMps",
}

export enum ShipStringField {
  Name = "name",
  CallSign = "callSign",
  VesselType = "vesselType",
  Flag = "flag",
  NavigationStatusLabel = "navStatusLabel",
  Destination = "destination",
  EstimatedArrival = "eta",
}

enum ShipTimestampLimit {
  MaximumAbsoluteMilliseconds = 8_640_000_000_000_000,
}

enum ShipDataPrecision {
  SpeedDecimalFactor = 10,
}

export const SHIP_NUMBER_FIELDS = Object.values(ShipNumberField);
export const SHIP_STRING_FIELDS = Object.values(ShipStringField);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isOptionalText(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function hasOptionalNumbers(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  return keys.every((key) => {
    const candidate = value[key];
    return candidate === undefined || isFiniteNumber(candidate);
  });
}

function hasOptionalStrings(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  return keys.every((key) => {
    const candidate = value[key];
    return candidate === undefined || typeof candidate === "string";
  });
}

function isServerVessel(value: unknown): value is ServerVessel {
  if (!isRecord(value)) return false;
  const mmsi = value.mmsi;
  const latitude = value.lat;
  const longitude = value.lon;
  const lastSeen = value.lastSeen;
  if (
    !isFiniteNumber(mmsi) ||
    !isFiniteNumber(latitude) ||
    !isFiniteNumber(longitude) ||
    !isFiniteNumber(lastSeen) ||
    !isFiniteNumber(value.sog) ||
    !isFiniteNumber(value.cog) ||
    !isFiniteNumber(value.heading) ||
    !isFiniteNumber(value.navStatus) ||
    typeof value.navStatusLabel !== "string" ||
    !isOptionalFiniteNumber(value.rot) ||
    !isOptionalFiniteNumber(value.imo) ||
    !isOptionalFiniteNumber(value.shipType) ||
    !isOptionalFiniteNumber(value.draught) ||
    !isOptionalFiniteNumber(value.length) ||
    !isOptionalFiniteNumber(value.width) ||
    !isOptionalFiniteNumber(value.dimA) ||
    !isOptionalFiniteNumber(value.dimB) ||
    !isOptionalFiniteNumber(value.dimC) ||
    !isOptionalFiniteNumber(value.dimD) ||
    !isOptionalText(value.name) ||
    !isOptionalText(value.callSign) ||
    !isOptionalText(value.shipTypeLabel) ||
    !isOptionalText(value.destination) ||
    !isOptionalText(value.eta)
  ) {
    return false;
  }
  return (
    Number.isSafeInteger(mmsi) &&
    mmsi > 0 &&
    latitude >= GeoLimit.MinLatitude &&
    latitude <= GeoLimit.MaxLatitude &&
    longitude >= GeoLimit.MinLongitude &&
    longitude <= GeoLimit.MaxLongitude &&
    Math.abs(lastSeen) <=
      ShipTimestampLimit.MaximumAbsoluteMilliseconds
  );
}

function isShipData(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOptionalNumbers(value, SHIP_NUMBER_FIELDS) &&
    hasOptionalStrings(value, SHIP_STRING_FIELDS)
  );
}

export function isShipPoint(value: unknown): value is ShipPoint {
  return (
    isRecord(value) &&
    value.type === Domain.Ships &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isFiniteNumber(value.lat) &&
    value.lat >= GeoLimit.MinLatitude &&
    value.lat <= GeoLimit.MaxLatitude &&
    isFiniteNumber(value.lon) &&
    value.lon >= GeoLimit.MinLongitude &&
    value.lon <= GeoLimit.MaxLongitude &&
    (value.timestamp === undefined ||
      typeof value.timestamp === "string") &&
    isShipData(value.data)
  );
}

export function parseShipServerPayload(
  value: unknown,
): ShipServerPayload | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.data) ||
    typeof value.vesselCount !== "number" ||
    !Number.isSafeInteger(value.vesselCount) ||
    value.vesselCount < 0 ||
    typeof value.connected !== "boolean"
  ) {
    return null;
  }
  const vessels: ServerVessel[] = [];
  for (const candidate of value.data) {
    if (!isServerVessel(candidate)) return null;
    vessels.push(candidate);
  }
  return {
    vessels,
    vesselCount: value.vesselCount,
    connected: value.connected,
  };
}

function toShipPoint(vessel: ServerVessel): ShipPoint | null {
  if (vessel.lat === 0 && vessel.lon === 0) return null;
  const speedMps = ktToMps(vessel.sog);
  return {
    id: `S${vessel.mmsi}`,
    type: Domain.Ships,
    lat: vessel.lat,
    lon: vessel.lon,
    timestamp: new Date(vessel.lastSeen).toISOString(),
    data: {
      mmsi: vessel.mmsi,
      imo: vessel.imo,
      name: vessel.name,
      callSign: vessel.callSign,
      vesselType: vessel.shipTypeLabel ?? "Unknown",
      shipTypeCode: vessel.shipType,
      speed:
        Math.round(vessel.sog * ShipDataPrecision.SpeedDecimalFactor) /
        ShipDataPrecision.SpeedDecimalFactor,
      sog: vessel.sog,
      cog: vessel.cog,
      heading: vessel.heading,
      navStatus: vessel.navStatus,
      navStatusLabel: vessel.navStatusLabel,
      rot: vessel.rot,
      destination: vessel.destination,
      draught: vessel.draught,
      eta: vessel.eta,
      length: vessel.length,
      width: vessel.width,
      dimA: vessel.dimA,
      dimB: vessel.dimB,
      dimC: vessel.dimC,
      dimD: vessel.dimD,
      speedMps,
    },
  };
}

export function decodeShipPoints(
  payload: ShipServerPayload,
): readonly ShipPoint[] {
  return payload.vessels.flatMap((vessel) => {
    const point = toShipPoint(vessel);
    return point ? [point] : [];
  });
}
