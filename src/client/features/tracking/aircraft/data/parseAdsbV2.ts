import { firstNumber } from "@shared/types/numbers";
import { Domain } from "@shared/domain/identity";
import { MS_PER_SECOND } from "@shared/time";

import type { DataPoint } from "@/features/base/dataPoints";
import type { ProviderFetchResult } from "@/features/base/types";
import { AircraftDataLabel, type AircraftData } from "../types";
import { authenticatedFetch } from "@/lib/net/authService";
import { getSquawkStatus, normalizeIcao24 } from "../lib/utils";
import {
  feetPerMinuteToMetersPerSecond,
  ktToMps,
} from "@/measurements";
import { isRecord } from "@shared/geo";
import { parseSourceState } from "@shared/source";

export enum AircraftFeedEndpoint {
  States = "/api/aircraft/states",
}

export enum AircraftFeedErrorKind {
  InvalidResponse = "The aircraft response format is invalid",
  RequestRejected = "The aircraft endpoint rejected the request",
}

export class AircraftFeedError extends Error {
  readonly httpStatus: number | null;
  readonly kind: AircraftFeedErrorKind;

  constructor(
    kind: AircraftFeedErrorKind,
    httpStatus: number | null = null,
  ) {
    super(kind);
    this.name = AircraftFeedError.name;
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

type AdsbAircraft = {
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
};

function isAdsbAircraft(value: unknown): value is AdsbAircraft {
  return isRecord(value);
}

export function toAircraftData(a: AdsbAircraft): AircraftData {
  const onGround = a.alt_baro === "ground";
  const altitude = onGround ? 0 : firstNumber(a.alt_baro);

  const speed = typeof a.gs === "number" ? a.gs : 0;
  const speedMps = ktToMps(speed);

  const heading = firstNumber(a.track, a.true_heading);

  const verticalRate =
    typeof a.baro_rate === "number"
      ? feetPerMinuteToMetersPerSecond(a.baro_rate)
      : undefined;

  const callsignTrimmed = (a.flight ?? "").trim();
  const callsign = callsignTrimmed.length > 0
    ? callsignTrimmed
    : AircraftDataLabel.Unknown;

  const icao24 = normalizeIcao24(a.hex) ?? a.hex;

  return {
    icao24,
    callsign,
    squawkStatus: getSquawkStatus(a.squawk),
    originCountry: a.originCountry ?? "",
    acType: a.acType ?? AircraftDataLabel.Unknown,
    altitude,
    speed,
    speedMps,
    heading,
    verticalRate,
    onGround,
    trueHeading: a.true_heading,
    tas: a.tas,
    mach: a.mach,
    ias: a.ias,
    windDir: a.wd,
    windSpd: a.ws,
    oat: a.oat,
    tat: a.tat,
    roll: a.roll,
    trackRate: a.track_rate,
    magHeading: a.mag_heading,
    geomRate: a.geom_rate,
    navHeading: a.nav_heading,
    navAltitudeMcp: a.nav_altitude_mcp,
    navAltitudeFms: a.nav_altitude_fms,
    navQnh: a.nav_qnh,
    navModes: a.nav_modes,
    rssi: a.rssi,
    nacP: a.nac_p,
    adsbType: a.type,
    squawk: a.squawk,
    registration: a.registration,
    manufacturerName: a.manufacturerName,
    model: a.model,
    operator: a.operator,
    operatorIcao: a.operatorIcao,
    categoryDescription: a.categoryDescription,
    military: a.military,
    recon: a.recon,
  };
}

function observationTime(
  aircraft: AdsbAircraft,
  receivedAt: number,
): number {
  if (
    typeof aircraft.observedAt === "number" &&
    Number.isFinite(aircraft.observedAt)
  ) {
    return Math.min(aircraft.observedAt, receivedAt);
  }
  const positionAge = firstNumber(aircraft.seen_pos, aircraft.seen);
  return receivedAt - Math.max(0, positionAge) * MS_PER_SECOND;
}

function toDataPoint(
  aircraft: AdsbAircraft,
  receivedAt: number,
): DataPoint | null {
  if (!aircraft.hex) return null;
  if (
    typeof aircraft.lat !== "number" ||
    typeof aircraft.lon !== "number"
  ) {
    return null;
  }
  return {
    id: `A${aircraft.hex}`,
    type: Domain.Aircraft,
    lat: aircraft.lat,
    lon: aircraft.lon,
    timestamp: new Date(
      observationTime(aircraft, receivedAt),
    ).toISOString(),
    data: toAircraftData(aircraft),
  };
}

export function parseAdsbResponse(
  json: unknown,
  receivedAt = Date.now(),
): DataPoint[] {
  if (!isRecord(json) || !Array.isArray(json.ac)) return [];
  const out: DataPoint[] = [];
  for (const value of json.ac) {
    if (!isAdsbAircraft(value)) continue;
    const point = toDataPoint(value, receivedAt);
    if (point) out.push(point);
  }
  return out;
}

export function parseAircraftFetchResult(
  value: unknown,
  receivedAt = Date.now(),
): ProviderFetchResult<DataPoint> | null {
  if (!isRecord(value) || !Array.isArray(value.ac)) return null;
  const source = parseSourceState(value.source);
  if (source?.source !== Domain.Aircraft) return null;
  return {
    data: parseAdsbResponse(value, receivedAt),
    source,
  };
}

export async function fetchAircraftSnapshot(): Promise<
  ProviderFetchResult<DataPoint>
> {
  const response = await authenticatedFetch(AircraftFeedEndpoint.States);
  if (!response.ok) {
    throw new AircraftFeedError(
      AircraftFeedErrorKind.RequestRejected,
      response.status,
    );
  }
  const result = parseAircraftFetchResult(await response.json());
  if (!result) {
    throw new AircraftFeedError(AircraftFeedErrorKind.InvalidResponse);
  }
  return result;
}

export async function fetchAircraftStates(): Promise<DataPoint[]> {
  return (await fetchAircraftSnapshot()).data;
}
