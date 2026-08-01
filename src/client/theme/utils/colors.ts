import type { DataType } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import {
  LAYER_COLOR_KEYS,
  LAYER_COLOR_METADATA,
  ThemeCssVar,
  ThemeMode,
  type ColorOverrides,
  type LayerColorKey,
  type Theme,
  type ThemeColors,
} from "../model";

enum ThemeColorMix {
  HeadingBasePercent = 68,
}

export type FeatureColorMap = Readonly<Record<DataType, string>>;

export function applyColorOverrides(
  base: ThemeColors,
  overrides: Partial<Record<LayerColorKey, string>> | undefined,
): ThemeColors {
  return overrides ? { ...base, ...overrides } : base;
}

export function getColorMap(theme: Theme): FeatureColorMap {
  const layerColors = Object.fromEntries(
    LAYER_COLOR_KEYS.map((key) => [
      key,
      theme.colors[LAYER_COLOR_METADATA[key].themeColor],
    ]),
  ) as Record<LayerColorKey, string>;
  return {
    ...layerColors,
    [Domain.CyclonesForecast]: layerColors[Domain.Cyclones],
    [Domain.CyclonesWarning]: layerColors[Domain.Cyclones],
  };
}

export function filterHeadingColor(
  theme: Theme,
  type: DataType,
): string {
  const base = getColorMap(theme)[type] ?? ThemeCssVar.Warning;
  return `color-mix(in srgb, ${base} ${ThemeColorMix.HeadingBasePercent}%, var(--sigint-bright))`;
}

export function createEmptyOverrides(): ColorOverrides {
  return {
    [ThemeMode.Dark]: {},
    [ThemeMode.Light]: {},
  };
}
