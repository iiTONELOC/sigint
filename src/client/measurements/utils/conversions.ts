import { MeasurementConversionFactor } from "../model";

export function kelvinToC(kelvin: number): number {
  return kelvin - MeasurementConversionFactor.KelvinOffset;
}

export function cToF(celsius: number): number {
  return (
    (celsius * MeasurementConversionFactor.CelsiusScaleNumerator) /
      MeasurementConversionFactor.CelsiusScaleDenominator +
    MeasurementConversionFactor.FahrenheitOffset
  );
}

export function kilometersToMeters(kilometers: number): number {
  return kilometers * MeasurementConversionFactor.MetersPerKilometer;
}

export function metersToFeet(meters: number): number {
  return meters * MeasurementConversionFactor.FeetPerMeter;
}

export function feetPerMinuteToMetersPerSecond(
  feetPerMinute: number,
): number {
  return feetPerMinute /
    MeasurementConversionFactor.FeetPerMinutePerMeterPerSecond;
}

export function metersPerSecondToFeetPerMinute(
  metersPerSecond: number,
): number {
  return metersPerSecond *
    MeasurementConversionFactor.FeetPerMinutePerMeterPerSecond;
}

export function kmToMi(kilometers: number): number {
  return Math.round(
    kilometers * MeasurementConversionFactor.KilometersToMiles,
  );
}

export function ktToMph(knots: number): number {
  return Math.round(
    knots * MeasurementConversionFactor.KnotsToMilesPerHour,
  );
}

export function ktToKmh(knots: number): number {
  return Math.round(
    knots * MeasurementConversionFactor.KilometersPerNauticalMile,
  );
}

export function ktToMps(knots: number): number {
  return knots * MeasurementConversionFactor.MetersPerSecondPerKnot;
}

export function nmToKm(nauticalMiles: number): number {
  return Math.round(
    nauticalMiles * MeasurementConversionFactor.KilometersPerNauticalMile,
  );
}
