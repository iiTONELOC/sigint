import { formatKtMph } from "@/measurements";
import { AisHeading } from "../types";

enum ShipNavigationValue {
  MinimumReportedDraughtMeters = 0,
  NoDriftDegrees = 1,
}

enum ShipDriftSide {
  Port = "port",
  Starboard = "stbd",
}

export function formatShipCourse(
  course: number | undefined,
  fallback: string,
): string {
  return course != null ? `${Math.round(course)}°` : fallback;
}

export function formatShipDraught(
  draught: number | undefined,
  fallback: string,
): string {
  return draught != null &&
    draught > ShipNavigationValue.MinimumReportedDraughtMeters
    ? `${draught.toFixed(1)} m`
    : fallback;
}

export function formatShipDrift(
  drift: number | null,
  fallback: string,
): string {
  if (drift === null) return fallback;
  if (Math.abs(drift) < ShipNavigationValue.NoDriftDegrees) return "none";
  const side = drift > 0 ? ShipDriftSide.Starboard : ShipDriftSide.Port;
  return `${Math.abs(Math.round(drift))}° ${side}`;
}

export function formatShipHeading(
  heading: number | undefined,
  fallback: string,
): string {
  return heading != null && heading !== AisHeading.Unavailable
    ? `${Math.round(heading)}°`
    : fallback;
}

export function formatShipSpeed(
  speed: number | undefined,
  fallback: string,
): string {
  return speed != null ? formatKtMph(Math.round(speed)) : fallback;
}
