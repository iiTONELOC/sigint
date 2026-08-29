import {
  cToF,
  kelvinToC,
  kilometersToMeters,
  metersToFeet,
} from "@/measurements";
import { resolveUnitMode } from "@/preferences/units/store";
import { UnitMode } from "@/preferences/units/model";

export function formatPixelKm(
  scanKilometers: number,
  trackKilometers: number,
  mode?: UnitMode,
): string {
  const scanMetersValue = kilometersToMeters(scanKilometers);
  const trackMetersValue = kilometersToMeters(trackKilometers);
  const scanMeters = Math.round(scanMetersValue);
  const trackMeters = Math.round(trackMetersValue);
  const scanFeet = Math.round(metersToFeet(scanMetersValue));
  const trackFeet = Math.round(metersToFeet(trackMetersValue));

  switch (resolveUnitMode(mode)) {
    case UnitMode.MilesPerHour:
      return `${scanFeet} × ${trackFeet} ft`;
    case UnitMode.Knots:
    case UnitMode.KilometersPerHour:
      return `${scanMeters} × ${trackMeters} m`;
    default:
      return `${scanMeters} × ${trackMeters} m (${scanFeet} × ${trackFeet} ft)`;
  }
}

export function formatTempCF(
  kelvin: number,
  mode?: UnitMode,
): string {
  const celsius = kelvinToC(kelvin);
  const fahrenheit = cToF(celsius);

  switch (resolveUnitMode(mode)) {
    case UnitMode.MilesPerHour:
      return `${Math.round(fahrenheit)} °F`;
    case UnitMode.Knots:
    case UnitMode.KilometersPerHour:
      return `${Math.round(celsius)} °C`;
    default:
      return `${Math.round(celsius)} °C (${Math.round(fahrenheit)} °F)`;
  }
}
