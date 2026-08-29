import { isRecord } from "../geo";
import { optionalString } from "../text";
import { optionalFiniteNumber } from "../types/numbers";

export const FIRE_LATEST_ROUTE = "/api/fires/latest";

export enum FireDayNight {
  Day = "D",
  Night = "N",
}

export enum FireConfidenceCode {
  High = "high",
  HighShort = "h",
  Low = "low",
  LowShort = "l",
  Nominal = "nominal",
  NominalShort = "n",
}

type FireObservationData = {
  brightness?: number;
  frp?: number;
  confidence?: string;
  satellite?: string;
  instrument?: string;
  scan?: number;
  track?: number;
  brightT31?: number;
  daynight?: string;
  acqDate?: string;
  acqTime?: string;
};

type FireComplexData = {
  complexSize?: number;
  complexFrp?: number;
};

export type FireData = FireObservationData & FireComplexData;

export type FireRecord = Required<FireObservationData> &
  FireComplexData & {
    lat: number;
    lon: number;
    version: string;
  };

export function parseFireData(value: unknown): FireData | null {
  if (!isRecord(value)) return null;
  return {
    brightness: optionalFiniteNumber(value.brightness),
    frp: optionalFiniteNumber(value.frp),
    confidence: optionalString(value.confidence),
    satellite: optionalString(value.satellite),
    instrument: optionalString(value.instrument),
    scan: optionalFiniteNumber(value.scan),
    track: optionalFiniteNumber(value.track),
    brightT31: optionalFiniteNumber(value.brightT31),
    daynight: optionalString(value.daynight),
    acqDate: optionalString(value.acqDate),
    acqTime: optionalString(value.acqTime),
    complexSize: optionalFiniteNumber(value.complexSize),
    complexFrp: optionalFiniteNumber(value.complexFrp),
  };
}

export function fireDataEquals(left: FireData, right: FireData): boolean {
  return left.brightness === right.brightness &&
    left.frp === right.frp &&
    left.confidence === right.confidence &&
    left.satellite === right.satellite &&
    left.instrument === right.instrument &&
    left.scan === right.scan &&
    left.track === right.track &&
    left.brightT31 === right.brightT31 &&
    left.daynight === right.daynight &&
    left.acqDate === right.acqDate &&
    left.acqTime === right.acqTime &&
    left.complexSize === right.complexSize &&
    left.complexFrp === right.complexFrp;
}
