import { describe, expect, test } from "bun:test";
import { DeviceType, LayoutMode, ViewportOrientation } from "@/layout-mode/model/layoutMode";

enum LayoutModeEnumCount {
  TwoValues = 2,
  ThreeValues = 3,
}

function expectUniqueValues(
  values: readonly string[],
  expectedCount: LayoutModeEnumCount,
): void {
  expect(values).toHaveLength(expectedCount);
  expect(new Set(values).size).toBe(expectedCount);
}

describe("layout-mode model", () => {
  test("owns unique persisted layout-mode values", () => {
    expectUniqueValues(
      Object.values(LayoutMode),
      LayoutModeEnumCount.ThreeValues,
    );
  });

  test("owns unique device-type values", () => {
    expectUniqueValues(
      Object.values(DeviceType),
      LayoutModeEnumCount.ThreeValues,
    );
  });

  test("owns unique orientation values", () => {
    expectUniqueValues(
      Object.values(ViewportOrientation),
      LayoutModeEnumCount.TwoValues,
    );
  });
});
