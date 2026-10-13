import { DeviceType, LayoutMode } from "../model/layoutMode";
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

export function usesMobileLayout(
  mode: LayoutMode,
  deviceType: DeviceType,
): boolean {
  if (mode === LayoutMode.Mobile) {
    return true;
  }
  if (mode === LayoutMode.Desktop) {
    return false;
  }
  return deviceType === DeviceType.Phone;
}
