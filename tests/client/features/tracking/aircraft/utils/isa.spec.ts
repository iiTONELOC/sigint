import { describe, expect, test } from "bun:test";
import {
  AircraftIsaValue,
  isaSpeedOfSoundKt,
  isaTempC,
  machFromGs,
} from "@/features/tracking/aircraft/utils";
import {
  MeasurementFixtureAviationExpected,
  MeasurementFixtureAviationInput,
} from "../../../../measurements/fixtures";

describe("aircraft ISA calculations", () => {
  test("owns unique policy values", () => {
    const values = Object.values(AircraftIsaValue).filter(
      (value): value is number => typeof value === "number",
    );
    expect(new Set(values).size).toBe(values.length);
  });

  test("uses sea-level speed and temperature", () => {
    const altitude =
      MeasurementFixtureAviationInput
        .SeaLevelAltitudeFeet;

    expect(
      isaSpeedOfSoundKt(altitude),
    ).toBeCloseTo(
      MeasurementFixtureAviationExpected
        .SeaLevelSpeedKnots,
    );
    expect(isaTempC(altitude)).toBe(
      MeasurementFixtureAviationExpected
        .SeaLevelTemperatureCelsius,
    );
    expect(
      machFromGs(
        MeasurementFixtureAviationInput
          .GroundSpeedKnots,
        altitude,
      ),
    ).toBeCloseTo(
      MeasurementFixtureAviationExpected.Mach,
    );
  });

  test("uses constant tropopause values at the boundary", () => {
    const altitude =
      MeasurementFixtureAviationInput
        .TropopauseAltitudeFeet;

    expect(
      isaSpeedOfSoundKt(altitude),
    ).toBeCloseTo(
      MeasurementFixtureAviationExpected
        .TropopauseSpeedKnots,
    );
    expect(isaTempC(altitude)).toBe(
      MeasurementFixtureAviationExpected
        .TropopauseTemperatureCelsius,
    );
  });
});
