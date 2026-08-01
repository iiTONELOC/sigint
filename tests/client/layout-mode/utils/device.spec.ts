import { describe, expect, test } from "bun:test";
import {
  DeviceType,
} from "@/layout-mode/model";
import {
  classifyDeviceType,
  type DeviceDetectionInput,
} from "@/layout-mode/utils";

enum DeviceFixturePlatform {
  Desktop = "Linux x86_64",
  IpadDesktop = "MacIntel",
}

enum DeviceFixtureTouchPoints {
  None = 0,
  Tablet = 2,
}

enum DeviceFixtureUserAgent {
  AndroidPhone = "Mozilla Android Mobile",
  AndroidTablet = "Mozilla Android",
  Desktop = "Mozilla X11 Linux x86_64",
  Ipad = "Mozilla iPad",
  Iphone = "Mozilla iPhone",
}

function deviceInput(
  values: Partial<DeviceDetectionInput> = {},
): DeviceDetectionInput {
  return {
    maxTouchPoints: DeviceFixtureTouchPoints.None,
    platform: DeviceFixturePlatform.Desktop,
    userAgent: DeviceFixtureUserAgent.Desktop,
    userAgentDataMobile: undefined,
    ...values,
  };
}

describe("classifyDeviceType", () => {
  test("classifies phone user agents", () => {
    expect(
      classifyDeviceType(
        deviceInput({ userAgent: DeviceFixtureUserAgent.Iphone }),
      ),
    ).toBe(DeviceType.Phone);
    expect(
      classifyDeviceType(
        deviceInput({ userAgent: DeviceFixtureUserAgent.AndroidPhone }),
      ),
    ).toBe(DeviceType.Phone);
  });

  test("uses the user-agent data mobile signal", () => {
    expect(
      classifyDeviceType(
        deviceInput({ userAgentDataMobile: true }),
      ),
    ).toBe(DeviceType.Phone);
  });

  test("classifies tablet user agents", () => {
    expect(
      classifyDeviceType(
        deviceInput({ userAgent: DeviceFixtureUserAgent.Ipad }),
      ),
    ).toBe(DeviceType.Tablet);
    expect(
      classifyDeviceType(
        deviceInput({ userAgent: DeviceFixtureUserAgent.AndroidTablet }),
      ),
    ).toBe(DeviceType.Tablet);
  });

  test("recognizes the iPadOS desktop signal", () => {
    expect(
      classifyDeviceType(
        deviceInput({
          maxTouchPoints: DeviceFixtureTouchPoints.Tablet,
          platform: DeviceFixturePlatform.IpadDesktop,
        }),
      ),
    ).toBe(DeviceType.Tablet);
  });

  test("classifies other signals as desktop", () => {
    expect(classifyDeviceType(deviceInput())).toBe(DeviceType.Desktop);
  });
});
