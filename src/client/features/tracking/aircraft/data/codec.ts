import { AircraftDataLabel } from "../formatters/presentation";
import { parsePoints } from "@/features/base/pointCodec";
import {
  type AircraftData,
  type AircraftPoint,
} from "@shared/domain/aircraft";
import { normalizeIcao24 } from "@shared/domain/aircraftDossier";
import { Domain } from "@shared/domain/identity";
import {
  createGeoPoint,
  isRecord,
  parseGeoPoint,
} from "@shared/geo";
import { MS_PER_SECOND } from "@shared/time";
import {
  firstNumber,
  isOptionalFiniteNumber,
} from "@shared/types/numbers";
import { feetPerMinuteToMetersPerSecond } from "@/measurements";

type AdsbAircraft = Readonly<{
  hex?: string;
  flight?: string | null;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  gs?: number;
  ias?: number;
  tas?: number;
  mach?: number;
  wd?: number;
  ws?: number;
  oat?: number;
  tat?: number;
  track?: number;
  track_rate?: number;
  true_heading?: number;
  mag_heading?: number;
  roll?: number;
  baro_rate?: number;
  geom_rate?: number;
  nav_heading?: number;
  nav_altitude_mcp?: number;
  nav_altitude_fms?: number;
  nav_qnh?: number;
  nav_modes?: readonly string[];
  rssi?: number;
  nac_p?: number;
  type?: string;
  squawk?: string;
  seen?: number;
  seen_pos?: number;
  observedAt?: number;
  acType?: string;
  registration?: string;
  manufacturerName?: string;
  model?: string;
  operator?: string;
  operatorIcao?: string;
  categoryDescription?: string;
  military?: boolean;
  recon?: boolean;
  originCountry?: string;
}>;

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function isOptionalStringList(value: unknown): boolean {
  return value === undefined ||
    (Array.isArray(value) &&
      value.every((entry) => typeof entry === "string"));
}

function isAdsbAircraft(value: unknown): value is AdsbAircraft {
  return isRecord(value) &&
    isOptionalString(value.hex) &&
    (value.flight === null || isOptionalString(value.flight)) &&
    isOptionalFiniteNumber(value.lat) &&
    isOptionalFiniteNumber(value.lon) &&
    (value.alt_baro === undefined ||
      typeof value.alt_baro === "string" ||
      (typeof value.alt_baro === "number" && Number.isFinite(value.alt_baro))) &&
    isOptionalFiniteNumber(value.gs) &&
    isOptionalFiniteNumber(value.ias) &&
    isOptionalFiniteNumber(value.tas) &&
    isOptionalFiniteNumber(value.mach) &&
    isOptionalFiniteNumber(value.wd) &&
    isOptionalFiniteNumber(value.ws) &&
    isOptionalFiniteNumber(value.oat) &&
    isOptionalFiniteNumber(value.tat) &&
    isOptionalFiniteNumber(value.track) &&
    isOptionalFiniteNumber(value.track_rate) &&
    isOptionalFiniteNumber(value.true_heading) &&
    isOptionalFiniteNumber(value.mag_heading) &&
    isOptionalFiniteNumber(value.roll) &&
    isOptionalFiniteNumber(value.baro_rate) &&
    isOptionalFiniteNumber(value.geom_rate) &&
    isOptionalFiniteNumber(value.nav_heading) &&
    isOptionalFiniteNumber(value.nav_altitude_mcp) &&
    isOptionalFiniteNumber(value.nav_altitude_fms) &&
    isOptionalFiniteNumber(value.nav_qnh) &&
    isOptionalStringList(value.nav_modes) &&
    isOptionalFiniteNumber(value.rssi) &&
    isOptionalFiniteNumber(value.nac_p) &&
    isOptionalString(value.type) &&
    isOptionalString(value.squawk) &&
    isOptionalFiniteNumber(value.seen) &&
    isOptionalFiniteNumber(value.seen_pos) &&
    isOptionalFiniteNumber(value.observedAt) &&
    isOptionalString(value.acType) &&
    isOptionalString(value.registration) &&
    isOptionalString(value.manufacturerName) &&
    isOptionalString(value.model) &&
    isOptionalString(value.operator) &&
    isOptionalString(value.operatorIcao) &&
    isOptionalString(value.categoryDescription) &&
    isOptionalBoolean(value.military) &&
    isOptionalBoolean(value.recon) &&
    isOptionalString(value.originCountry);
}

function isAircraftData(value: unknown): value is AircraftData {
  return isRecord(value) &&
    isOptionalString(value.model) &&
    isOptionalString(value.acType) &&
    isOptionalFiniteNumber(value.speed) &&
    isOptionalFiniteNumber(value.heading) &&
    isOptionalString(value.icao24) &&
    isOptionalString(value.callsign) &&
    isOptionalString(value.operator) &&
    isOptionalFiniteNumber(value.altitude) &&
    isOptionalBoolean(value.onGround) &&
    isOptionalFiniteNumber(value.tas) &&
    isOptionalFiniteNumber(value.mach) &&
    isOptionalFiniteNumber(value.ias) &&
    isOptionalFiniteNumber(value.windDir) &&
    isOptionalFiniteNumber(value.windSpd) &&
    isOptionalFiniteNumber(value.oat) &&
    isOptionalFiniteNumber(value.tat) &&
    isOptionalFiniteNumber(value.roll) &&
    isOptionalFiniteNumber(value.trackRate) &&
    isOptionalFiniteNumber(value.magHeading) &&
    isOptionalFiniteNumber(value.trueHeading) &&
    isOptionalFiniteNumber(value.geomRate) &&
    isOptionalFiniteNumber(value.navHeading) &&
    isOptionalFiniteNumber(value.navAltitudeMcp) &&
    isOptionalFiniteNumber(value.navAltitudeFms) &&
    isOptionalFiniteNumber(value.navQnh) &&
    isOptionalStringList(value.navModes) &&
    isOptionalFiniteNumber(value.rssi) &&
    isOptionalFiniteNumber(value.nacP) &&
    isOptionalString(value.adsbType) &&
    isOptionalString(value.registration) &&
    isOptionalString(value.operatorIcao) &&
    isOptionalString(value.originCountry) &&
    isOptionalFiniteNumber(value.verticalRate) &&
    isOptionalString(value.manufacturerName) &&
    isOptionalString(value.categoryDescription) &&
    isOptionalString(value.squawk) &&
    isOptionalBoolean(value.military) &&
    isOptionalBoolean(value.recon);
}

function canonicalAircraftData(value: unknown): AircraftData | null {
  if (!isAircraftData(value)) return null;
  return {
    model: value.model,
    acType: value.acType,
    speed: value.speed,
    heading: value.heading,
    icao24: value.icao24,
    callsign: value.callsign,
    operator: value.operator,
    altitude: value.altitude,
    onGround: value.onGround,
    tas: value.tas,
    mach: value.mach,
    ias: value.ias,
    windDir: value.windDir,
    windSpd: value.windSpd,
    oat: value.oat,
    tat: value.tat,
    roll: value.roll,
    trackRate: value.trackRate,
    magHeading: value.magHeading,
    trueHeading: value.trueHeading,
    geomRate: value.geomRate,
    navHeading: value.navHeading,
    navAltitudeMcp: value.navAltitudeMcp,
    navAltitudeFms: value.navAltitudeFms,
    navQnh: value.navQnh,
    navModes: value.navModes,
    rssi: value.rssi,
    nacP: value.nacP,
    adsbType: value.adsbType,
    registration: value.registration,
    operatorIcao: value.operatorIcao,
    originCountry: value.originCountry,
    verticalRate: value.verticalRate,
    manufacturerName: value.manufacturerName,
    categoryDescription: value.categoryDescription,
    squawk: value.squawk,
    military: value.military,
    recon: value.recon,
  };
}

function observationTime(
  aircraft: AdsbAircraft,
  receivedAt: number,
): number {
  if (aircraft.observedAt !== undefined) {
    return Math.min(aircraft.observedAt, receivedAt);
  }
  const positionAge = firstNumber(aircraft.seen_pos, aircraft.seen);
  return receivedAt - Math.max(0, positionAge) * MS_PER_SECOND;
}

function toAircraftData(
  aircraft: AdsbAircraft,
  icao24: string,
): AircraftData {
  const onGround = aircraft.alt_baro === "ground";
  const callsign = (aircraft.flight ?? "").trim();
  return {
    icao24,
    callsign: callsign || AircraftDataLabel.Unknown,
    originCountry: aircraft.originCountry ?? "",
    acType: aircraft.acType ?? AircraftDataLabel.Unknown,
    altitude: onGround ? 0 : firstNumber(aircraft.alt_baro),
    speed: aircraft.gs ?? 0,
    heading: firstNumber(aircraft.track, aircraft.true_heading),
    verticalRate: aircraft.baro_rate === undefined
      ? undefined
      : feetPerMinuteToMetersPerSecond(aircraft.baro_rate),
    onGround,
    trueHeading: aircraft.true_heading,
    tas: aircraft.tas,
    mach: aircraft.mach,
    ias: aircraft.ias,
    windDir: aircraft.wd,
    windSpd: aircraft.ws,
    oat: aircraft.oat,
    tat: aircraft.tat,
    roll: aircraft.roll,
    trackRate: aircraft.track_rate,
    magHeading: aircraft.mag_heading,
    geomRate: aircraft.geom_rate,
    navHeading: aircraft.nav_heading,
    navAltitudeMcp: aircraft.nav_altitude_mcp,
    navAltitudeFms: aircraft.nav_altitude_fms,
    navQnh: aircraft.nav_qnh,
    navModes: aircraft.nav_modes,
    rssi: aircraft.rssi,
    nacP: aircraft.nac_p,
    adsbType: aircraft.type,
    squawk: aircraft.squawk,
    registration: aircraft.registration,
    manufacturerName: aircraft.manufacturerName,
    model: aircraft.model,
    operator: aircraft.operator,
    operatorIcao: aircraft.operatorIcao,
    categoryDescription: aircraft.categoryDescription,
    military: aircraft.military,
    recon: aircraft.recon,
  };
}

function toAircraftPoint(
  aircraft: AdsbAircraft,
  receivedAt: number,
): AircraftPoint | null {
  const icao24 = normalizeIcao24(aircraft.hex);
  const position = aircraft.lon === undefined || aircraft.lat === undefined
    ? null
    : createGeoPoint(aircraft.lon, aircraft.lat);
  if (!icao24 || !position) return null;
  return {
    id: `A${icao24}`,
    type: Domain.Aircraft,
    position,
    timestamp: new Date(observationTime(aircraft, receivedAt)).toISOString(),
    data: toAircraftData(aircraft, icao24),
  };
}

export function parseAdsbResponse(
  value: unknown,
  receivedAt = Date.now(),
): AircraftPoint[] {
  if (!isRecord(value) || !Array.isArray(value.ac)) return [];
  const points: AircraftPoint[] = [];
  for (const candidate of value.ac) {
    if (!isAdsbAircraft(candidate)) continue;
    const point = toAircraftPoint(candidate, receivedAt);
    if (point) points.push(point);
  }
  return points;
}

export function isAircraftPoint(value: unknown): value is AircraftPoint {
  return isRecord(value) &&
    value.type === Domain.Aircraft &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    parseGeoPoint(value.position) !== null &&
    (value.timestamp === undefined || typeof value.timestamp === "string") &&
    isAircraftData(value.data);
}

function cachedAircraftPoint(value: unknown): AircraftPoint | null {
  if (!isRecord(value)) return null;
  const position = parseGeoPoint(value.position) ?? (
    typeof value.lon === "number" && typeof value.lat === "number"
      ? createGeoPoint(value.lon, value.lat)
      : null
  );
  const data = canonicalAircraftData(value.data);
  if (
    value.type !== Domain.Aircraft ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    !position ||
    (value.timestamp !== undefined && typeof value.timestamp !== "string") ||
    !data
  ) {
    return null;
  }
  return {
    id: value.id,
    type: Domain.Aircraft,
    position,
    ...(value.timestamp === undefined ? {} : { timestamp: value.timestamp }),
    data,
  };
}

export function parseAircraftCache(
  value: unknown,
): readonly AircraftPoint[] | null {
  return parsePoints(value, cachedAircraftPoint);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) && !Array.isArray(right)) return left === right;
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

export function aircraftDataEquals(
  previous: AircraftData,
  next: AircraftData,
): boolean {
  const previousEntries = Object.entries(previous);
  if (previousEntries.length !== Object.keys(next).length) return false;
  return previousEntries.every(([key, value]) =>
    valuesEqual(value, Reflect.get(next, key))
  );
}
