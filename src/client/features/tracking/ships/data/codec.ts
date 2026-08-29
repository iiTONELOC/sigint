import { Domain } from "@shared/domain/identity";
import {
  AisNavigationStatus,
  type AisVesselRecord,
  type ShipData,
  type ShipPoint,
  type ShipServerPayload,
} from "@shared/domain/ships";
import {
  createGeoPoint,
  isNullIsland,
  isRecord,
  parseGeoPoint,
} from "@shared/geo";
import { optionalString } from "@shared/text";
import { isNumberEnumValue } from "@shared/types/enum";
import {
  isOptionalFiniteNumber,
  optionalFiniteNumber,
} from "@shared/types/numbers";

enum ShipTimestampLimit {
  MaximumAbsoluteMilliseconds = 8_640_000_000_000_000,
}

function isServerVessel(value: unknown): value is AisVesselRecord {
  if (!isRecord(value)) return false;
  const longitude = optionalFiniteNumber(value.lon);
  const latitude = optionalFiniteNumber(value.lat);
  const lastSeen = optionalFiniteNumber(value.lastSeen);
  const position = longitude === undefined || latitude === undefined
    ? null
    : createGeoPoint(longitude, latitude);
  return (
    position !== null &&
    !isNullIsland(position) &&
    lastSeen !== undefined &&
    Math.abs(lastSeen) <=
      ShipTimestampLimit.MaximumAbsoluteMilliseconds &&
    optionalFiniteNumber(value.sog) !== undefined &&
    optionalFiniteNumber(value.cog) !== undefined &&
    optionalFiniteNumber(value.heading) !== undefined &&
    isNumberEnumValue(value.navStatus, AisNavigationStatus) &&
    isShipData(value)
  );
}

function isShipData(value: unknown): value is ShipData {
  return (
    isRecord(value) &&
    typeof value.mmsi === "number" &&
    Number.isSafeInteger(value.mmsi) &&
    value.mmsi > 0 &&
    isOptionalFiniteNumber(value.imo) &&
    isOptionalFiniteNumber(value.shipTypeCode) &&
    isOptionalFiniteNumber(value.sog) &&
    isOptionalFiniteNumber(value.cog) &&
    isOptionalFiniteNumber(value.heading) &&
    (value.navStatus === undefined || isNumberEnumValue(value.navStatus, AisNavigationStatus)) &&
    isOptionalFiniteNumber(value.rot) &&
    isOptionalFiniteNumber(value.draught) &&
    isOptionalFiniteNumber(value.dimA) &&
    isOptionalFiniteNumber(value.dimB) &&
    isOptionalFiniteNumber(value.dimC) &&
    isOptionalFiniteNumber(value.dimD) &&
    (value.name === undefined || optionalString(value.name) !== undefined) &&
    (value.callSign === undefined || optionalString(value.callSign) !== undefined) &&
    (value.destination === undefined || optionalString(value.destination) !== undefined) &&
    (value.eta === undefined || optionalString(value.eta) !== undefined)
  );
}

export function isShipPoint(value: unknown): value is ShipPoint {
  if (!isRecord(value)) return false;
  const position = parseGeoPoint(value.position);
  return value.type === Domain.Ships &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    position !== null &&
    !isNullIsland(position) &&
    (value.timestamp === undefined || optionalString(value.timestamp) !== undefined) &&
    isShipData(value.data);
}

export function parseLegacyShipPoint(value: unknown): ShipPoint | null {
  if (
    !isRecord(value) ||
    value.type !== Domain.Ships ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    !isShipData(value.data)
  ) {
    return null;
  }
  const longitude = optionalFiniteNumber(value.lon);
  const latitude = optionalFiniteNumber(value.lat);
  const position = longitude === undefined || latitude === undefined
    ? null
    : createGeoPoint(longitude, latitude);
  if (!position || isNullIsland(position)) return null;
  const timestamp = optionalString(value.timestamp);
  if (value.timestamp !== undefined && timestamp === undefined) return null;
  return {
    id: value.id,
    type: Domain.Ships,
    position,
    ...(timestamp === undefined ? {} : { timestamp }),
    data: value.data,
  };
}

export function shipDataEquals(left: ShipData, right: ShipData): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (Reflect.get(left, key) !== Reflect.get(right, key)) return false;
  }
  return true;
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
  const vessels: AisVesselRecord[] = [];
  for (const candidate of value.data) {
    if (isServerVessel(candidate)) vessels.push(candidate);
  }
  return {
    vessels,
    vesselCount: value.vesselCount,
    connected: value.connected,
  };
}

function toShipPoint(vessel: AisVesselRecord): ShipPoint | null {
  const { lat, lon, lastSeen, ...data } = vessel;
  const position = createGeoPoint(lon, lat);
  if (!position || isNullIsland(position)) return null;
  return {
    id: `S${vessel.mmsi}`,
    type: Domain.Ships,
    position,
    timestamp: new Date(lastSeen).toISOString(),
    data,
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
