import { describe, expect, test } from "bun:test";
import { DeviceType, LayoutMode } from "@/layout-mode/model/layoutMode";
import {
  nextLayoutMode,
  parseLayoutMode,
  usesMobileLayout,
} from "@/layout-mode/utils/layout";

enum LayoutFixtureInvalidValue {
  Empty = "",
}

describe("usesMobileLayout", () => {
  test("uses the mobile layout for phones in auto mode", () => {
    expect(usesMobileLayout(LayoutMode.Auto, DeviceType.Phone)).toBe(true);
  });

  test("uses desktop layout for tablets and desktops in auto mode", () => {
    expect(usesMobileLayout(LayoutMode.Auto, DeviceType.Tablet)).toBe(false);
    expect(usesMobileLayout(LayoutMode.Auto, DeviceType.Desktop)).toBe(false);
  });

  test("forced modes override the device", () => {
    expect(usesMobileLayout(LayoutMode.Mobile, DeviceType.Desktop)).toBe(true);
    expect(usesMobileLayout(LayoutMode.Desktop, DeviceType.Phone)).toBe(false);
  });
});

describe("layout-mode persistence", () => {
  test("accepts owned values", () => {
    expect(parseLayoutMode(LayoutMode.Auto)).toBe(LayoutMode.Auto);
    expect(parseLayoutMode(LayoutMode.Mobile)).toBe(LayoutMode.Mobile);
    expect(parseLayoutMode(LayoutMode.Desktop)).toBe(LayoutMode.Desktop);
  });

  test("rejects invalid persisted values", () => {
    expect(parseLayoutMode(LayoutFixtureInvalidValue.Empty)).toBeNull();
    expect(parseLayoutMode(DeviceType.Tablet)).toBeNull();
    expect(parseLayoutMode(null)).toBeNull();
    expect(parseLayoutMode(undefined)).toBeNull();
  });
});

describe("nextLayoutMode", () => {
  test("cycles through the owned order", () => {
    expect(nextLayoutMode(LayoutMode.Auto)).toBe(LayoutMode.Mobile);
    expect(nextLayoutMode(LayoutMode.Mobile)).toBe(LayoutMode.Desktop);
    expect(nextLayoutMode(LayoutMode.Desktop)).toBe(LayoutMode.Auto);
  });
});
