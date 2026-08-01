import { describe, expect, test } from "bun:test";
import { formatKtMph, formatKtShort } from "@/measurements";
import {
  UnitMode,
} from "@/preferences/units";
import {
  MeasurementFixtureConversionInput,
  MeasurementFixtureCopy,
} from "../fixtures";

function expectSpeed(
  mode: UnitMode,
  full: MeasurementFixtureCopy,
  short: MeasurementFixtureCopy,
): void {
  expect(
    formatKtMph(
      MeasurementFixtureConversionInput.Knots,
      mode,
    ),
  ).toBe(full);
  expect(
    formatKtShort(
      MeasurementFixtureConversionInput.Knots,
      mode,
    ),
  ).toBe(short);
}

describe("speed formatters", () => {
  test("formats both units", () => {
    expectSpeed(
      UnitMode.Both,
      MeasurementFixtureCopy.SpeedBoth,
      MeasurementFixtureCopy.SpeedShortBoth,
    );
  });

  test("formats knots", () => {
    expectSpeed(
      UnitMode.Knots,
      MeasurementFixtureCopy.SpeedKnots,
      MeasurementFixtureCopy.SpeedShortKnots,
    );
  });

  test("formats miles per hour", () => {
    expectSpeed(
      UnitMode.MilesPerHour,
      MeasurementFixtureCopy.SpeedMilesPerHour,
      MeasurementFixtureCopy.SpeedShortMilesPerHour,
    );
  });

  test("formats kilometers per hour", () => {
    expectSpeed(
      UnitMode.KilometersPerHour,
      MeasurementFixtureCopy
        .SpeedKilometersPerHour,
      MeasurementFixtureCopy
        .SpeedShortKilometersPerHour,
    );
  });
});
