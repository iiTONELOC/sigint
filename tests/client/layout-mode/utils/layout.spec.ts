import { describe, expect, test } from "bun:test";
import {
  DeviceType,
  LayoutMode,
  ViewportOrientation,
} from "@/layout-mode/model";
import {
  nextLayoutMode,
  parseLayoutMode,
  usesMobileLayout,
  viewportOrientation,
} from "@/layout-mode/utils";

enum LayoutFixtureDimension {
  Narrow = 390,
  Wide = 844,
}

enum LayoutFixtureInvalidValue {
  Empty = "",
}

describe("viewportOrientation", () => {
  test("classifies portrait and landscape dimensions", () => {
    expect(
      viewportOrientation(
        LayoutFixtureDimension.Narrow,
        LayoutFixtureDimension.Wide,
      ),
    ).toBe(ViewportOrientation.Portrait);
    expect(
      viewportOrientation(
        LayoutFixtureDimension.Wide,
        LayoutFixtureDimension.Narrow,
      ),
    ).toBe(ViewportOrientation.Landscape);
  });
});
describe("usesMobileLayout", () => {
  test("uses phone orientation in auto mode", () => {
    expect(
      usesMobileLayout(
        LayoutMode.Auto,
        DeviceType.Phone,
        ViewportOrientation.Portrait,
      ),
    ).toBe(true);
    expect(
      usesMobileLayout(
        LayoutMode.Auto,
        DeviceType.Phone,
        ViewportOrientation.Landscape,
      ),
    ).toBe(false);
  });

  test("uses desktop layout for tablets and desktops in auto mode", () => {
    expect(
      usesMobileLayout(
        LayoutMode.Auto,
        DeviceType.Tablet,
        ViewportOrientation.Portrait,
      ),
    ).toBe(false);
    expect(
      usesMobileLayout(
        LayoutMode.Auto,
        DeviceType.Desktop,
        ViewportOrientation.Portrait,
      ),
    ).toBe(false);
  });

  test("forced modes override device and orientation", () => {
    expect(
      usesMobileLayout(
        LayoutMode.Mobile,
        DeviceType.Desktop,
        ViewportOrientation.Landscape,
      ),
    ).toBe(true);
    expect(
      usesMobileLayout(
        LayoutMode.Desktop,
        DeviceType.Phone,
        ViewportOrientation.Portrait,
      ),
    ).toBe(false);
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
