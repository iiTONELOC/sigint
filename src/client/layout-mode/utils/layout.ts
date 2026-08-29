import { DeviceType, LayoutMode, ViewportOrientation } from "../model/layoutMode";
import { isEnumValue } from "@shared/types/enum";

export function parseLayoutMode(value: unknown): LayoutMode | null {
  return isEnumValue(value, LayoutMode) ? value : null;
}

export function nextLayoutMode(mode: LayoutMode): LayoutMode {
  const modes = Object.values(LayoutMode);
  const currentIndex = modes.indexOf(mode);
  const nextIndex = (currentIndex + 1) % modes.length;
  return modes[nextIndex] ?? LayoutMode.Auto;
}

export function viewportOrientation(
  width: number,
  height: number,
): ViewportOrientation {
  return height >= width
    ? ViewportOrientation.Portrait
    : ViewportOrientation.Landscape;
}

export function usesMobileLayout(
  mode: LayoutMode,
  deviceType: DeviceType,
  orientation: ViewportOrientation,
): boolean {
  if (mode === LayoutMode.Mobile) {
    return true;
  }
  if (mode === LayoutMode.Desktop) {
    return false;
  }
  return (
    deviceType === DeviceType.Phone &&
    orientation === ViewportOrientation.Portrait
  );
}
