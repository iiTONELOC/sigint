import { formatKtMph } from "@/measurements";
import { AIS_HEADING_UNAVAILABLE, AisRateOfTurn } from "@shared/domain/ships";
import { TurnDeg } from "@shared/geo";

enum ShipNavigationValue {
  MinimumReportedDraughtMeters = 0,
  NoDriftDegrees = 1,
}

enum ShipDriftSide {
  Port = "port",
  Starboard = "stbd",
  StarboardFull = "starboard",
}

export function setDrift(heading: number | undefined, course: number | undefined): number | null {
  if (
    heading === undefined ||
    course === undefined ||
    heading === AIS_HEADING_UNAVAILABLE
  ) {
    return null;
  }
  let drift = course - heading;
  while (drift > TurnDeg.Half) drift -= TurnDeg.Full;
  while (drift < -TurnDeg.Half) drift += TurnDeg.Full;
  return drift;
}

export function rotLabel(rot: number | undefined): string | null {
  if (rot === undefined || Math.abs(rot) > AisRateOfTurn.HardTurn) return null;
  if (rot === AisRateOfTurn.Steady) return "steady";
  const direction = rot < 0 ? ShipDriftSide.Port : ShipDriftSide.StarboardFull;
  return Math.abs(rot) === AisRateOfTurn.HardTurn
    ? `hard to ${direction}`
    : `turning to ${direction}`;
}

export function formatShipCourse(course: number | undefined, fallback: string): string {
  return course != null ? `${Math.round(course)}°` : fallback;
}

export function formatShipDraught(draught: number | undefined, fallback: string): string {
  return draught != null &&
    draught > ShipNavigationValue.MinimumReportedDraughtMeters
    ? `${draught.toFixed(1)} m`
    : fallback;
}

export function formatShipDrift(drift: number | null, fallback: string): string {
  if (drift === null) return fallback;
  if (Math.abs(drift) < ShipNavigationValue.NoDriftDegrees) return "none";
  const side = drift > 0 ? ShipDriftSide.Starboard : ShipDriftSide.Port;
  return `${Math.abs(Math.round(drift))}° ${side}`;
}

export function formatShipHeading(heading: number | undefined, fallback: string): string {
  return heading != null && heading !== AIS_HEADING_UNAVAILABLE
    ? `${Math.round(heading)}°`
    : fallback;
}

export function formatShipSpeed(speed: number | undefined, fallback: string): string {
  return speed != null ? formatKtMph(Math.round(speed)) : fallback;
}
