export type AircraftHistoryPoint = {
  lat: number;
  lon: number;
  altitude?: number;
  heading?: number;
  timestamp: string;
};

export type SquawkCode = "7700" | "7600" | "7500" | string;
export type SquawkLabel = "EMERGENCY" | "RADIO FAILURE" | "HIJACK" | "NORMAL";
export type SquawkStatus = "normal" | "emergency" | "radio_failure" | "hijack";

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
  squawks: Set<SquawkCode>;
  countries: Set<string>;
  /** "all" = everything, "military" = mil only, "civilian" = civ only,
   *  "recon" = Hurricane Hunter / reconnaissance aircraft only. */
  milFilter: "all" | "military" | "civilian" | "recon";
};
