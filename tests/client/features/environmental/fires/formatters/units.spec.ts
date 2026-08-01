import { describe, expect, test } from "bun:test";
import {
  formatPixelKm,
  formatTempCF,
} from "@/features/environmental/fires/formatters";
import {
  UnitMode,
} from "@/preferences/units";
import {
  MeasurementFixtureCopy,
  MeasurementFixtureFireInput,
} from "../../../../measurements/fixtures";

function expectFireFormatting(
  mode: UnitMode,
  footprint: MeasurementFixtureCopy,
  temperature: MeasurementFixtureCopy,
): void {
  expect(
    formatPixelKm(
      MeasurementFixtureFireInput.ScanKilometers,
      MeasurementFixtureFireInput.TrackKilometers,
      mode,
    ),
  ).toBe(footprint);
  expect(
    formatTempCF(
      MeasurementFixtureFireInput.BrightnessKelvin,
      mode,
    ),
  ).toBe(temperature);
}

describe("fire unit formatters", () => {
  test("formats both unit families", () => {
    expectFireFormatting(
      UnitMode.Both,
      MeasurementFixtureCopy.FootprintBoth,
      MeasurementFixtureCopy.TemperatureBoth,
    );
  });

  test("formats imperial units", () => {
    expectFireFormatting(
      UnitMode.MilesPerHour,
      MeasurementFixtureCopy.FootprintImperial,
      MeasurementFixtureCopy.TemperatureImperial,
    );
  });

  test("formats metric units for knots", () => {
    expectFireFormatting(
      UnitMode.Knots,
      MeasurementFixtureCopy.FootprintMetric,
      MeasurementFixtureCopy.TemperatureMetric,
    );
  });

  test("formats metric units for kilometers per hour", () => {
    expectFireFormatting(
      UnitMode.KilometersPerHour,
      MeasurementFixtureCopy.FootprintMetric,
      MeasurementFixtureCopy.TemperatureMetric,
    );
  });
});
