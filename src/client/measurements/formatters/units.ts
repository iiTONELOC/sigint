import { resolveUnitMode } from "@/preferences/units/store";
import { UnitMode } from "@/preferences/units/model";
import { MeasurementConversionFactor } from "../model/conversion";
import { kmToMi, ktToKmh, ktToMph, nmToKm } from "../utils/conversions";

export function formatNauticalMiles(
  nauticalMiles: number,
  mode?: UnitMode,
): string {
  const rounded = Math.round(nauticalMiles);
  switch (resolveUnitMode(mode)) {
    case UnitMode.Knots:
      return `${rounded} nm`;
    case UnitMode.MilesPerHour:
      return `${kmToMi(nauticalMiles * MeasurementConversionFactor.KilometersPerNauticalMile)} mi`;
    case UnitMode.KilometersPerHour:
      return `${nmToKm(nauticalMiles)} km`;
    default:
      return `${rounded} nm (${nmToKm(nauticalMiles)} km)`;
  }
}

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
