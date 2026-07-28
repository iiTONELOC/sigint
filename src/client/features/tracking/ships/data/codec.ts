import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { ktToMps } from "@/lib/format/units";
import { isRecord } from "@shared/geo";

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

const REQUIRED_NUMBER_FIELDS = [
  "sog",
  "cog",
  "heading",
  "navStatus",
] as const;

const OPTIONAL_NUMBER_FIELDS = [
  "rot",
  "imo",
  "shipType",
  "draught",
  "length",
  "width",
  "dimA",
  "dimB",
  "dimC",
  "dimD",
] as const;

const OPTIONAL_STRING_FIELDS = [
  "name",
  "callSign",
  "shipTypeLabel",
  "destination",
  "eta",
] as const;

const SHIP_NUMBER_FIELDS = [
  "mmsi",
  "imo",
  "shipTypeCode",
  "speed",
  "sog",
  "cog",
  "heading",
  "navStatus",
  "rot",
  "draught",
  "length",
  "width",
  "dimA",
  "dimB",
  "dimC",
  "dimD",
  "speedMps",
] as const;

const SHIP_STRING_FIELDS = [
  "name",
  "callSign",
  "vesselType",
  "flag",
  "navStatusLabel",
  "destination",
  "eta",
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
    !REQUIRED_NUMBER_FIELDS.every((key) =>
      isFiniteNumber(value[key]),
    ) ||
    typeof value.navStatusLabel !== "string" ||
    !hasOptionalNumbers(value, OPTIONAL_NUMBER_FIELDS) ||
    !hasOptionalStrings(value, OPTIONAL_STRING_FIELDS)
  ) {
    return false;
  }
  return (
    Number.isSafeInteger(mmsi) &&
    mmsi > 0 &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    Math.abs(lastSeen) <= 8.64e15
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
    value.type === "ships" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isFiniteNumber(value.lat) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    isFiniteNumber(value.lon) &&
    value.lon >= -180 &&
    value.lon <= 180 &&
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
      speed: Math.round(vessel.sog * 10) / 10,
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
