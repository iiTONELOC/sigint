import { describe, expect, test } from "bun:test";
import {
  formatBearingDeg,
  formatNmKm,
  formatPressureMb,
} from "@/features/environmental/cyclones/formatters";
import {
  MeasurementFixtureCopy,
  MeasurementFixtureCycloneInput,
} from "../../../../measurements/fixtures";

describe("cyclone unit formatters", () => {
  test("formats pressure, bearing, and nautical distance", () => {
    expect(
      formatPressureMb(
        MeasurementFixtureCycloneInput
          .PressureMillibars,
      ),
    ).toBe(MeasurementFixtureCopy.Pressure);
    expect(
      formatBearingDeg(
        MeasurementFixtureCycloneInput
          .BearingDegrees,
      ),
    ).toBe(MeasurementFixtureCopy.Bearing);
    expect(
      formatNmKm(
        MeasurementFixtureCycloneInput
          .NauticalMiles,
      ),
    ).toBe(
      MeasurementFixtureCopy.NauticalDistance,
    );
  });
});
