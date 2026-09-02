import { DeviceType } from "../model/layoutMode";

enum DeviceTouchPointBoundary {
  TouchMinimumExclusive = 0,
  TabletMinimumExclusive = 1,
}
enum DevicePlatform {
  IpadDesktop = "MacIntel",
}

type UserAgentData = Readonly<{
  mobile?: boolean;
}>;

type NavigatorWithUserAgentData = Navigator & Readonly<{
  userAgentData?: UserAgentData;
}>;

export type DeviceDetectionInput = Readonly<{
  maxTouchPoints: number;
  platform: string;
  userAgent: string;
  userAgentDataMobile: boolean | undefined;
}>;

function hasUserAgentData(
  value: Navigator,
): value is NavigatorWithUserAgentData {
  return "userAgentData" in value;
}

export function classifyDeviceType(
  input: DeviceDetectionInput,
): DeviceType {
  const phoneUserAgent =
    /iPhone|iPod|Windows Phone/i.test(input.userAgent) ||
    (
      /Android/i.test(input.userAgent) &&
      /Mobile/i.test(input.userAgent)
    );
  if (phoneUserAgent || input.userAgentDataMobile === true) {
    return DeviceType.Phone;
  }

  const tabletUserAgent =
    /iPad|Tablet|PlayBook|Silk/i.test(input.userAgent) ||
    (
      /Android/i.test(input.userAgent) &&
      !/Mobile/i.test(input.userAgent)
    );
  const iPadDesktopUserAgent =
    input.platform === DevicePlatform.IpadDesktop &&
    input.maxTouchPoints >
      DeviceTouchPointBoundary.TabletMinimumExclusive;
  if (tabletUserAgent || iPadDesktopUserAgent) {
    return DeviceType.Tablet;
  }

  return DeviceType.Desktop;
}

export function hasTouchScreen(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints >
      DeviceTouchPointBoundary.TouchMinimumExclusive
  );
}

export function detectDeviceType(): DeviceType {
  if (typeof navigator === "undefined") {
    return DeviceType.Desktop;
  }

  return classifyDeviceType({
    maxTouchPoints: navigator.maxTouchPoints,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    userAgentDataMobile: hasUserAgentData(navigator)
      ? navigator.userAgentData?.mobile
      : undefined,
  });
}
