import { describe, expect, test } from "bun:test";
import { formatKmMi } from "@/measurements";
import {
  UnitMode,
} from "@/preferences/units";
import {
  MeasurementFixtureConversionInput,
  MeasurementFixtureCopy,
} from "../../../../measurements/fixtures";

function expectDistance(
  mode: UnitMode,
  expected: MeasurementFixtureCopy,
): void {
  expect(
    formatKmMi(
      MeasurementFixtureConversionInput
        .DistanceKilometers,
      mode,
    ),
  ).toBe(expected);
}

describe("earthquake distance formatter", () => {
  test("formats both units", () => {
    expectDistance(
      UnitMode.Both,
      MeasurementFixtureCopy.DistanceBoth,
    );
  });

  test("formats imperial units", () => {
    expectDistance(
      UnitMode.MilesPerHour,
      MeasurementFixtureCopy.DistanceImperial,
    );
  });

  test("formats metric units for knots", () => {
    expectDistance(
      UnitMode.Knots,
      MeasurementFixtureCopy.DistanceMetric,
    );
  });

  test("formats metric units for kilometers per hour", () => {
    expectDistance(
      UnitMode.KilometersPerHour,
      MeasurementFixtureCopy.DistanceMetric,
    );
  });
});
