import type { AircraftData, AircraftFilter, SquawkStatus } from "../types";
import type { BasePoint } from "@/features/base/types";

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
  switch (squawk) {
    case "7700":
      return "emergency";
    case "7600":
      return "radio_failure";
    case "7500":
      return "hijack";
    default:
      return "normal";
  }
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

export function matchesAircraftFilter(
  item: BasePoint,
  f: AircraftFilter,
): boolean {
  if (!f.enabled) return false;
  const d = (item as unknown as { data: AircraftData }).data;
  const onGround: boolean = d?.onGround === true;
  if (!f.showAirborne && !onGround) return false;
  if (!f.showGround && onGround) return false;
  if (f.milFilter === "military" && !d?.military) return false;
  if (f.milFilter === "civilian" && d?.military) return false;
  if (f.milFilter === "recon" && !d?.recon) return false;
  if (f.squawks.size > 0) {
    const sq: string = d?.squawk ?? "";
    const bucket =
      sq === "7700"
        ? "7700"
        : sq === "7600"
          ? "7600"
          : sq === "7500"
            ? "7500"
            : "other";
    if (!f.squawks.has(bucket as "7700" | "7600" | "7500" | "other"))
      return false;
  }
  if (f.countries.size > 0) {
    if (!f.countries.has(d?.originCountry ?? "")) return false;
  }
  return true;
}
