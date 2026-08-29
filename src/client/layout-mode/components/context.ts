import { createContext } from "react";
import type { DeviceType, LayoutMode } from "../model/layoutMode";

export type LayoutModeContextValue = Readonly<{
  cycleMode: () => void;
  deviceType: DeviceType;
  isMobile: boolean;
  mode: LayoutMode;
  setMode: (mode: LayoutMode) => void;
}>;

export const LayoutModeContext = createContext<
  LayoutModeContextValue | undefined
>(undefined);
