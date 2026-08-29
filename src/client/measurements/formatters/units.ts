import { resolveUnitMode } from "@/preferences/units/store";
import { UnitMode } from "@/preferences/units/model";
import { kmToMi, ktToKmh, ktToMph } from "../utils/conversions";

export function formatKmMi(
  kilometers: number,
  mode?: UnitMode,
): string {
  const rounded = Math.round(kilometers);
  switch (resolveUnitMode(mode)) {
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
  switch (resolveUnitMode(mode)) {
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
  switch (resolveUnitMode(mode)) {
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
