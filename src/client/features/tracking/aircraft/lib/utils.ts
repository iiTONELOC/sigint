import type { AircraftData, AircraftFilter, SquawkStatus } from "../types";
import type { BasePoint } from "@/features/base/types";
import {
  MilFilter,
  squawkBucketFor,
  squawkStatusFor,
} from "@shared/domain/aircraft";
import { isEnumValue } from "@shared/types/enum";

/**
 * Normalize an ICAO24 hex address: trim, lowercase, strip quotes,
 * validate hex characters, zero-pad to 6 chars.
 */
export function normalizeIcao24(value: string | undefined): string | null {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^['"]|['"]$/g, "");
  if (!normalized) return null;
  if (!/^[0-9a-f]+$/i.test(normalized)) return null;
  return normalized.length < 6 ? normalized.padStart(6, "0") : normalized;
}

export function getSquawkStatus(squawk?: string): SquawkStatus {
  return squawkStatusFor(squawk);
}

// Delay-severity → sig token class. Single owner for the on-time/late ramp used
// by the dossier on-time chip and arrival time. Red is reserved for 60+ min.
export function delaySeverity(mins: number): string {
  if (mins <= 0) return "sig-quakes";
  if (mins <= 15) return "sig-warn";
  if (mins <= 60) return "sig-fires";
  return "sig-danger";
}

// readsb message-source type → short label (how we're tracking it).
export function sourceLabel(type?: string): string | null {
  if (!type) return null;
  if (type.startsWith("adsb") || type.startsWith("adsr")) return "ADS-B";
  if (type.startsWith("mlat")) return "MLAT";
  if (type.startsWith("tisb")) return "TIS-B";
  if (type.startsWith("mode_s")) return "MODE-S";
  return type.toUpperCase();
}

// Headwind (+) / tailwind (−) and crosswind component from wind (FROM dir, kt)
// relative to the aircraft track. Returns null when wind/track are absent.
export function windComponents(
  windDir?: number,
  windSpd?: number,
  track?: number,
): { readonly head: number; readonly cross: number; readonly side: "L" | "R" } | null {
  if (windDir == null || windSpd == null || track == null) return null;
  const a = ((windDir - track) * Math.PI) / 180;
  const head = Math.round(windSpd * Math.cos(a));
  const crossRaw = windSpd * Math.sin(a);
  return { head, cross: Math.round(Math.abs(crossRaw)), side: crossRaw >= 0 ? "R" : "L" };
}

export function getSquawkStatusLabel(status: SquawkStatus): string {
  switch (status) {
    case "emergency":
      return "EMERGENCY";
    case "radio_failure":
      return "RADIO FAILURE";
    case "hijack":
      return "HIJACK";
    default:
      return "NORMAL";
  }
}

/** Narrows a filter that crossed a worker boundary as unknown. */
export function isAircraftFilter(value: unknown): value is AircraftFilter {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AircraftFilter>;
  return (
    typeof candidate.enabled === "boolean" &&
    typeof candidate.showAirborne === "boolean" &&
    typeof candidate.showGround === "boolean" &&
    candidate.squawks instanceof Set &&
    candidate.countries instanceof Set &&
    isEnumValue(candidate.milFilter, MilFilter)
  );
}

function matchesRole(aircraft: AircraftData, milFilter: MilFilter): boolean {
  if (milFilter === MilFilter.Military) return aircraft?.military === true;
  if (milFilter === MilFilter.Civilian) return aircraft?.military !== true;
  if (milFilter === MilFilter.Recon) return aircraft?.recon === true;
  return true;
}

function matchesMovement(
  aircraft: AircraftData,
  filter: AircraftFilter,
): boolean {
  const onGround = aircraft?.onGround === true;
  return onGround ? filter.showGround : filter.showAirborne;
}

function matchesSquawk(
  aircraft: AircraftData,
  filter: AircraftFilter,
): boolean {
  if (filter.squawks.size === 0) return true;
  return filter.squawks.has(squawkBucketFor(aircraft?.squawk));
}

function matchesCountry(
  aircraft: AircraftData,
  filter: AircraftFilter,
): boolean {
  if (filter.countries.size === 0) return true;
  return filter.countries.has(aircraft?.originCountry ?? "");
}

export function matchesAircraftFilter(
  item: BasePoint,
  filter: AircraftFilter,
): boolean {
  if (!filter.enabled) return false;
  const aircraft = (item as BasePoint & { data: AircraftData }).data;
  return (
    matchesMovement(aircraft, filter) &&
    matchesRole(aircraft, filter.milFilter) &&
    matchesSquawk(aircraft, filter) &&
    matchesCountry(aircraft, filter)
  );
}
