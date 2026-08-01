import { getUnitsMode, UnitMode } from "@/preferences/units";
import { kmToMi, ktToKmh, ktToMph } from "../utils";

function activeUnitMode(mode: UnitMode | undefined): UnitMode {
  return mode ?? getUnitsMode();
}

export function formatKmMi(
  kilometers: number,
  mode?: UnitMode,
): string {
  const rounded = Math.round(kilometers);
  switch (activeUnitMode(mode)) {
    case UnitMode.MilesPerHour:
      return `${kmToMi(kilometers)} mi`;
    case UnitMode.Knots:
    case UnitMode.KilometersPerHour:
      return `${rounded} km`;
    default:
      return `${rounded} km (${kmToMi(kilometers)} mi)`;
  }
}

export function formatKtMph(
  knots: number,
  mode?: UnitMode,
): string {
  switch (activeUnitMode(mode)) {
    case UnitMode.Knots:
      return `${knots} kn`;
    case UnitMode.MilesPerHour:
      return `${ktToMph(knots)} mph`;
    case UnitMode.KilometersPerHour:
      return `${ktToKmh(knots)} km/h`;
    default:
      return `${knots} kn (${ktToMph(knots)} mph)`;
  }
}

export function formatKtShort(
  knots: number,
  mode?: UnitMode,
): string {
  switch (activeUnitMode(mode)) {
    case UnitMode.Knots:
      return `${knots}kn`;
    case UnitMode.MilesPerHour:
      return `${ktToMph(knots)}mph`;
    case UnitMode.KilometersPerHour:
      return `${ktToKmh(knots)}km/h`;
    default:
      return `${knots}kn/${ktToMph(knots)}mph`;
  }
}
