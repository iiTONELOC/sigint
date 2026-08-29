import type { GeoPoint } from "../geo";
import { Domain } from "./identity";
import { isEnumValue } from "@shared/types/enum";

export enum AircraftApiRoute {
  Dossier = "/api/dossier/aircraft",
  States = "/api/aircraft/states",
}

export type AircraftData = {
  model?: string;
  acType?: string;
  speed?: number;
  heading?: number;
  icao24?: string;
  callsign?: string;
  operator?: string;
  altitude?: number;
  onGround?: boolean;
  tas?: number;
  mach?: number;
  ias?: number;
  windDir?: number;
  windSpd?: number;
  oat?: number;
  tat?: number;
  roll?: number;
  trackRate?: number;
  magHeading?: number;
  trueHeading?: number;
  geomRate?: number;
  navHeading?: number;
  navAltitudeMcp?: number;
  navAltitudeFms?: number;
  navQnh?: number;
  navModes?: readonly string[];
  rssi?: number;
  nacP?: number;
  adsbType?: string;
  registration?: string;
  operatorIcao?: string;
  originCountry?: string;
  verticalRate?: number;
  manufacturerName?: string;
  categoryDescription?: string;
  squawk?: string;
  military?: boolean;
  recon?: boolean;
};

export type AircraftPoint = Readonly<{
  id: string;
  type: Domain.Aircraft;
  position: GeoPoint;
  timestamp?: string;
  data: AircraftData;
}>;

export enum SquawkCode {
  Emergency = "7700",
  RadioFailure = "7600",
  Hijack = "7500",
}

export enum SquawkBucket {
  Emergency = "7700",
  RadioFailure = "7600",
  Hijack = "7500",
  Other = "other",
}

export enum SquawkStatus {
  Emergency = "emergency",
  RadioFailure = "radio_failure",
  Hijack = "hijack",
  Normal = "normal",
}

export enum MilFilter {
  All = "all",
  Military = "military",
  Civilian = "civilian",
  Recon = "recon",
}

export enum AircraftReconProfileId {
  Noaa42 = "noaa42",
  Noaa43 = "noaa43",
  Noaa49 = "noaa49",
  Noaa56 = "noaa56",
  Usaf53rd = "usaf_53rd",
}

export type AircraftReconProfile = Readonly<{
  icao24: readonly string[];
  callsigns: readonly string[];
  registration?: string;
  nickname?: string;
}>;

export const AIRCRAFT_RECON_PROFILES: Readonly<
  Record<AircraftReconProfileId, AircraftReconProfile>
> = {
  [AircraftReconProfileId.Usaf53rd]: {
    icao24: [
      "AE0111", "AE0112", "AE0113", "AE0114", "AE0116", "AE0117",
      "AE0258", "AE0259", "AE04A1",
    ],
    callsigns: ["TEAL71", "TEAL72", "TEAL73", "TEAL74", "TEAL75", "TEAL76"],
  },
  [AircraftReconProfileId.Noaa42]: {
    icao24: ["A4FAC3"],
    callsigns: ["NOAA42"],
    registration: "N42RF",
    nickname: "kermit",
  },
  [AircraftReconProfileId.Noaa43]: {
    icao24: ["A52242"],
    callsigns: ["NOAA43"],
    registration: "N43RF",
    nickname: "miss piggy",
  },
  [AircraftReconProfileId.Noaa49]: {
    icao24: ["A60F3C"],
    callsigns: ["NOAA49"],
    registration: "N49RF",
    nickname: "gonzo",
  },
  [AircraftReconProfileId.Noaa56]: {
    icao24: [],
    callsigns: ["NOAA56"],
  },
};

function buildAircraftReconIndexes() {
  const byCallsign: Record<string, AircraftReconProfile> = Object.create(null);
  const byIcao24: Record<string, AircraftReconProfile> = Object.create(null);
  const byRegistration: Record<string, AircraftReconProfile> = Object.create(null);
  for (const profile of Object.values(AIRCRAFT_RECON_PROFILES)) {
    for (const callsign of profile.callsigns) byCallsign[callsign] = profile;
    for (const icao24 of profile.icao24) byIcao24[icao24] = profile;
    if (profile.registration) {
      byRegistration[profile.registration] = profile;
    }
  }
  return { byCallsign, byIcao24, byRegistration };
}

const AIRCRAFT_RECON_INDEXES = buildAircraftReconIndexes();

export function classifyRecon(
  identity: string | Pick<AircraftData, "callsign" | "icao24" | "registration">,
): boolean {
  if (typeof identity === "string") {
    const icao24 = identity.trim().toUpperCase();
    return AIRCRAFT_RECON_INDEXES.byIcao24[icao24] !== undefined;
  }
  const icao24 = (identity.icao24 ?? "").trim().toUpperCase();
  const callsign = (identity.callsign ?? "").trim().toUpperCase();
  const registration = (identity.registration ?? "").trim().toUpperCase();
  return (
    AIRCRAFT_RECON_INDEXES.byIcao24[icao24] !== undefined ||
    AIRCRAFT_RECON_INDEXES.byCallsign[callsign] !== undefined ||
    AIRCRAFT_RECON_INDEXES.byRegistration[registration] !== undefined
  );
}

export function aircraftReconNickname(data: AircraftData): string {
  const icao24 = (data.icao24 ?? "").trim().toUpperCase();
  const registration = (data.registration ?? "").trim().toUpperCase();
  return (
    AIRCRAFT_RECON_INDEXES.byIcao24[icao24] ??
    AIRCRAFT_RECON_INDEXES.byRegistration[registration]
  )?.nickname ?? "";
}

export function squawkBucketFor(squawk: string | undefined): SquawkBucket {
  return isEnumValue(squawk, SquawkBucket) ? squawk : SquawkBucket.Other;
}

export function squawkStatusFor(squawk: string | undefined): SquawkStatus {
  switch (squawk) {
    case SquawkCode.Emergency:
      return SquawkStatus.Emergency;
    case SquawkCode.RadioFailure:
      return SquawkStatus.RadioFailure;
    case SquawkCode.Hijack:
      return SquawkStatus.Hijack;
    default:
      return SquawkStatus.Normal;
  }
}

export function squawkStatusLabel(status: SquawkStatus): string {
  return status.replaceAll("_", " ").toUpperCase();
}
