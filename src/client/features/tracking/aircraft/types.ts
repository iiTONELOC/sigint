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

export type SquawkLabel = "EMERGENCY" | "RADIO FAILURE" | "HIJACK" | "NORMAL";
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
  /** True airspeed (kt), Mach, indicated airspeed (kt) — present in the adsb.fi
   *  v3 (readsb) feed for many aircraft; undefined when not transmitted. */
  tas?: number;
  mach?: number;
  ias?: number;
  /** Wind from the feed: direction (° true) and speed (kt). */
  windDir?: number;
  windSpd?: number;
  /** Outer/static + total air temperature (°C). */
  oat?: number;
  tat?: number;
  /** Roll angle (°, negative = left). Pitch is NOT transmitted by ADS-B, so
   *  there is no attitude/pitch field — only a real bank indicator is possible. */
  roll?: number;
  /** Rate of change of track (°/s). */
  trackRate?: number;
  /** Magnetic heading (°). `heading` already carries track/true_heading. */
  magHeading?: number;
  /** True heading (°, nose direction) when transmitted — kept separate from
   *  `heading` (which prefers ground track) so the wind-drift crab angle
   *  (track − heading) can be shown. */
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
