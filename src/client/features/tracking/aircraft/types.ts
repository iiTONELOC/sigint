import type {
  MilFilter,
  SquawkBucket,
  SquawkStatus,
} from "@shared/domain/aircraft";

export type AircraftHistoryPoint = {
  lat: number;
  lon: number;
  altitude?: number;
  heading?: number;
  timestamp: string;
};

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

export enum SquawkLabel {
  Emergency = "EMERGENCY",
  Hijack = "HIJACK",
  Normal = "NORMAL",
  RadioFailure = "RADIO FAILURE",
}
export type { SquawkStatus } from "@shared/domain/aircraft";

export type AircraftData = {
  model?: string;
  acType?: string;
  speed?: number;
  heading?: number;
  icao24?: string;
  airport?: string;
  frequency?: string;
  callsign?: string;
  operator?: string;
  altitude?: number;
  speedMps?: number;
  onGround?: boolean;
  /** True airspeed, Mach, and indicated airspeed from the ADS-B feed. */
  tas?: number;
  mach?: number;
  ias?: number;
  /** Wind direction in true degrees and wind speed in knots. */
  windDir?: number;
  windSpd?: number;
  /** Outer/static + total air temperature (°C). */
  oat?: number;
  tat?: number;
  /** Roll angle in degrees. A negative value indicates a left bank. */
  roll?: number;
  /** Rate of change of track (°/s). */
  trackRate?: number;
  /** Magnetic heading (°). `heading` already carries track/true_heading. */
  magHeading?: number;
  /** True nose heading. The heading field prefers the ground track. */
  trueHeading?: number;
  /** Geometric (GNSS) vertical rate (fpm). `verticalRate` is baro. */
  geomRate?: number;
  /** Flight-director / autopilot selected values + engaged modes (real bugs). */
  navHeading?: number;
  navAltitudeMcp?: number;
  navAltitudeFms?: number;
  navQnh?: number;
  navModes?: readonly string[];
  /** Signal intel: receiver RSSI (dBFS), position accuracy category (NACp,
   *  0–11), and the readsb message source type (adsb_icao / mlat / tisb …). */
  rssi?: number;
  nacP?: number;
  adsbType?: string;
  audioStream?: string;
  registration?: string;
  operatorIcao?: string;
  originCountry?: string;
  verticalRate?: number;
  manufacturerName?: string;
  categoryDescription?: string;
  squawk?: SquawkStatus | string;
  /** UI-only emergency classification derived from `squawk` (parseAdsbV2). */
  squawkStatus?: SquawkStatus;
  military?: boolean;
  /** Hurricane Hunter / reconnaissance aircraft (server-tagged by ICAO hex). */
  recon?: boolean;
};

export type AircraftFilter = {
  enabled: boolean;
  showAirborne: boolean;
  showGround: boolean;
  squawks: Set<SquawkBucket>;
  countries: Set<string>;
  milFilter: MilFilter;
};
