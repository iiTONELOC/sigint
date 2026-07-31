import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import {
  hasOptionalFields,
  hasPointShape,
  isOptionalBoolean,
  isOptionalNumber,
  isOptionalString,
  parsePointList,
} from "@/features/base/pointCodec";
import type { AircraftData } from "@/features/tracking/aircraft/types";
import { isRecord } from "@shared/geo";

export type AircraftPoint = Extract<DataPoint, { type: Domain.Aircraft }>;

export const AIRCRAFT_STRING_FIELDS = [
  "model",
  "acType",
  "icao24",
  "airport",
  "frequency",
  "callsign",
  "operator",
  "audioStream",
  "registration",
  "operatorIcao",
  "originCountry",
  "manufacturerName",
  "categoryDescription",
  "squawk",
  "squawkStatus",
  "adsbType",
] as const;

export const AIRCRAFT_NUMBER_FIELDS = [
  "speed",
  "heading",
  "altitude",
  "speedMps",
  "tas",
  "mach",
  "ias",
  "windDir",
  "windSpd",
  "oat",
  "tat",
  "roll",
  "trackRate",
  "magHeading",
  "trueHeading",
  "geomRate",
  "navHeading",
  "navAltitudeMcp",
  "navAltitudeFms",
  "navQnh",
  "rssi",
  "nacP",
  "verticalRate",
] as const;

export const AIRCRAFT_BOOLEAN_FIELDS = [
  "onGround",
  "military",
  "recon",
] as const;

function isAircraftData(value: unknown): value is AircraftData {
  return (
    isRecord(value) &&
    hasOptionalFields(value, AIRCRAFT_STRING_FIELDS, isOptionalString) &&
    hasOptionalFields(value, AIRCRAFT_NUMBER_FIELDS, isOptionalNumber) &&
    hasOptionalFields(value, AIRCRAFT_BOOLEAN_FIELDS, isOptionalBoolean) &&
    (value.navModes === undefined ||
      (Array.isArray(value.navModes) &&
        value.navModes.every((mode: unknown) => typeof mode === "string")))
  );
}

export function isAircraftPoint(value: unknown): value is AircraftPoint {
  return hasPointShape(value, Domain.Aircraft) && isAircraftData(value.data);
}

export function parseAircraftCache(
  value: unknown,
): readonly AircraftPoint[] | null {
  return parsePointList(value, isAircraftPoint);
}
