import { createContext } from "react";
import type { ColorOverrides, LayerColorKey, Theme } from "./colors";
import type { ResolvedThemeMode, ThemeMode } from "./themeMode";

export type ThemeContextValue = Readonly<{
  colorOverrides: ColorOverrides;
  mode: ThemeMode;
  resetAllColors: () => void;
  resetLayerColor: (key: LayerColorKey) => void;
  resolvedMode: ResolvedThemeMode;
  setLayerColor: (key: LayerColorKey, color: string) => void;
  setMode: (mode: ThemeMode) => void;
  theme: Theme;
}>;

export const ThemeContext = createContext<ThemeContextValue | undefined>(
  undefined,
);
