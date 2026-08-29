import type { DataType } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import {
  LAYER_COLOR_METADATA,
  ThemeCssVar,
  type ColorOverrides,
  type LayerColorKey,
  type Theme,
  type ThemeColors,
} from "../model/colors";
import { ThemeMode } from "../model/themeMode";

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

function layerColor(theme: Theme, key: LayerColorKey): string {
  return theme.colors[LAYER_COLOR_METADATA[key].themeColor];
}

export function getColorMap(theme: Theme): FeatureColorMap {
  const cycloneColor = layerColor(theme, Domain.Cyclones);
  return {
    [Domain.Aircraft]: layerColor(theme, Domain.Aircraft),
    [Domain.Ships]: layerColor(theme, Domain.Ships),
    [Domain.Events]: layerColor(theme, Domain.Events),
    [Domain.Weather]: layerColor(theme, Domain.Weather),
    [Domain.Cyclones]: cycloneColor,
    [Domain.Quakes]: layerColor(theme, Domain.Quakes),
    [Domain.Fires]: layerColor(theme, Domain.Fires),
    [Domain.CyclonesForecast]: cycloneColor,
    [Domain.CyclonesWarning]: cycloneColor,
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
