import { describe, expect, test } from "bun:test";
import { MeasurementConversionFactor } from "@/measurements/model";

describe("measurement conversion model", () => {
  test("owns unique factors", () => {
    const factors = Object.values(MeasurementConversionFactor).filter(
      (value): value is number => typeof value === "number",
    );
    expect(new Set(factors).size).toBe(factors.length);
  });
});
