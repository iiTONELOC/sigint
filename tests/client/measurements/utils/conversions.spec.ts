import { describe, expect, test } from "bun:test";
import {
  cToF,
  feetPerMinuteToMetersPerSecond,
  kelvinToC,
  kilometersToMeters,
  kmToMi,
  ktToKmh,
  ktToMph,
  ktToMps,
  metersToFeet,
  metersPerSecondToFeetPerMinute,
  nmToKm,
} from "@/measurements";
import {
  MeasurementFixtureConversionExpected,
  MeasurementFixtureConversionInput,
} from "../fixtures";

describe("measurement conversions", () => {
  test("converts temperature boundaries", () => {
    expect(
      kelvinToC(
        MeasurementFixtureConversionInput.Kelvin,
      ),
    ).toBe(
      MeasurementFixtureConversionExpected.Celsius,
    );
    expect(
      cToF(
        MeasurementFixtureConversionInput.Celsius,
      ),
    ).toBe(
      MeasurementFixtureConversionExpected.Fahrenheit,
    );
  });

  test("converts metric and nautical distances", () => {
    expect(
      kmToMi(
        MeasurementFixtureConversionInput
          .DistanceKilometers,
      ),
    ).toBe(
      MeasurementFixtureConversionExpected.Miles,
    );
    expect(
      nmToKm(
        MeasurementFixtureConversionInput
          .NauticalMiles,
      ),
    ).toBe(
      MeasurementFixtureConversionExpected.Kilometers,
    );
  });

  test("converts footprint dimensions", () => {
    const meters = kilometersToMeters(
      MeasurementFixtureConversionInput.FootprintKilometers,
    );
    expect(meters).toBe(
      MeasurementFixtureConversionExpected.Meters,
    );
    expect(Math.round(metersToFeet(meters))).toBe(
      MeasurementFixtureConversionExpected.Feet,
    );
  });

  test("converts knots for display and motion", () => {
    const knots =
      MeasurementFixtureConversionInput.Knots;

    expect(ktToMph(knots)).toBe(
      MeasurementFixtureConversionExpected
        .MilesPerHour,
    );
    expect(ktToKmh(knots)).toBe(
      MeasurementFixtureConversionExpected
        .KilometersPerHour,
    );
    expect(ktToMps(knots)).toBeCloseTo(
      MeasurementFixtureConversionExpected
        .MetersPerSecond,
    );
  });

  test("converts vertical speed", () => {
    expect(
      feetPerMinuteToMetersPerSecond(
        MeasurementFixtureConversionInput.FeetPerMinute,
      ),
    ).toBeCloseTo(
      MeasurementFixtureConversionExpected
        .MetersPerSecondFromFeetPerMinute,
    );
    expect(
      metersPerSecondToFeetPerMinute(
        MeasurementFixtureConversionInput.MetersPerSecond,
      ),
    ).toBeCloseTo(
      MeasurementFixtureConversionExpected.FeetPerMinute,
    );
  });
});
