import type { DataType } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { ThemeColorKey } from "@shared/domain/theme";
import { ThemeMode, type ResolvedThemeMode } from "./themeMode";

export enum ThemeCssVar {
  Accent = "var(--sigint-accent)",
  Danger = "var(--sigint-danger)",
  Warning = "var(--sigint-warn)",
}

export type ThemeColors = Readonly<Record<ThemeColorKey, string>>;

const AIRCRAFT_ALERT_COLORS: Pick<
  ThemeColors,
  | ThemeColorKey.AircraftEmergency
  | ThemeColorKey.AircraftHijack
  | ThemeColorKey.AircraftRadioFailure
> = {
  [ThemeColorKey.AircraftEmergency]: "#ff3333",
  [ThemeColorKey.AircraftHijack]: "#cc44ff",
  [ThemeColorKey.AircraftRadioFailure]: "#ff8800",
};

export type Theme = Readonly<{
  colors: ThemeColors;
}>;

export const themes: Readonly<Record<ResolvedThemeMode, Theme>> = {
  [ThemeMode.Dark]: {
    colors: {
      [ThemeColorKey.Background]: "#080a0f",
      [ThemeColorKey.Panel]: "#0c1018",
      [ThemeColorKey.Border]: "#172033",
      [ThemeColorKey.Accent]: "#00d4f0",
      [ThemeColorKey.Coast]: "#1e4060",
      [ThemeColorKey.CoastFill]: "#0f1e2e",
      [ThemeColorKey.Ocean]: "#0e1825",
      [ThemeColorKey.OceanDeep]: "#060c16",
      [ThemeColorKey.Grid]: "#3a4d66",
      [ThemeColorKey.Ships]: "#00d4f0",
      [ThemeColorKey.Aircraft]: "#ffcc00",
      ...AIRCRAFT_ALERT_COLORS,
      [ThemeColorKey.Events]: "#dd44aa",
      [ThemeColorKey.Quakes]: "#66ff44",
      [ThemeColorKey.Fires]: "#ff6600",
      [ThemeColorKey.Weather]: "#aa66ff",
      [ThemeColorKey.Cyclones]: "#ff2b3d",
      [ThemeColorKey.Recon]: "#ff9500",
      [ThemeColorKey.Military]: "#e0e0e0",
      [ThemeColorKey.CycloneWarning]: "#ff1a6e",
      [ThemeColorKey.CycloneWatch]: "#ffb300",
      [ThemeColorKey.Text]: "#b0bec5",
      [ThemeColorKey.Dim]: "#556070",
      [ThemeColorKey.Bright]: "#e8eef4",
      [ThemeColorKey.Danger]: "#ff3333",
      [ThemeColorKey.Warning]: "#facc15",
    },
  },
  [ThemeMode.Light]: {
    colors: {
      [ThemeColorKey.Background]: "#f0f2f5",
      [ThemeColorKey.Panel]: "#ffffff",
      [ThemeColorKey.Border]: "#b0bcc8",
      [ThemeColorKey.Accent]: "#006a90",
      [ThemeColorKey.Coast]: "#8a9aaa",
      [ThemeColorKey.CoastFill]: "#e8e0d4",
      [ThemeColorKey.Ocean]: "#ddeaf4",
      [ThemeColorKey.OceanDeep]: "#c8daea",
      [ThemeColorKey.Grid]: "#4a5568",
      [ThemeColorKey.Ships]: "#7b2d8e",
      [ThemeColorKey.Aircraft]: "#1a8a6e",
      ...AIRCRAFT_ALERT_COLORS,
      [ThemeColorKey.Events]: "#e62e8a",
      [ThemeColorKey.Quakes]: "#2b5fb3",
      [ThemeColorKey.Fires]: "#cc2200",
      [ThemeColorKey.Weather]: "#e07000",
      [ThemeColorKey.Cyclones]: "#a3001a",
      [ThemeColorKey.Recon]: "#b86b00",
      [ThemeColorKey.Military]: "#3a3a3a",
      [ThemeColorKey.CycloneWarning]: "#c2185b",
      [ThemeColorKey.CycloneWatch]: "#b45309",
      [ThemeColorKey.Text]: "#1a2530",
      [ThemeColorKey.Dim]: "#4a5a6a",
      [ThemeColorKey.Bright]: "#0a1018",
      [ThemeColorKey.Danger]: "#cc1111",
      [ThemeColorKey.Warning]: "#b45309",
    },
  },
};

export type LayerColorMetadata = Readonly<{
  label: string;
  themeColor: ThemeColorKey;
}>;

export const LAYER_COLOR_METADATA = {
  [Domain.Aircraft]: {
    label: "Aircraft",
    themeColor: ThemeColorKey.Aircraft,
  },
  [Domain.Ships]: {
    label: "AIS Vessels",
    themeColor: ThemeColorKey.Ships,
  },
  [Domain.Events]: {
    label: "GDELT Events",
    themeColor: ThemeColorKey.Events,
  },
  [Domain.Quakes]: {
    label: "Seismic",
    themeColor: ThemeColorKey.Quakes,
  },
  [Domain.Fires]: {
    label: "Fires",
    themeColor: ThemeColorKey.Fires,
  },
  [Domain.Weather]: {
    label: "Weather",
    themeColor: ThemeColorKey.Weather,
  },
  [Domain.Cyclones]: {
    label: "Tropical Cyclones",
    themeColor: ThemeColorKey.Cyclones,
  },
} satisfies Readonly<Partial<Record<DataType, LayerColorMetadata>>>;

export type LayerColorKey = keyof typeof LAYER_COLOR_METADATA;

export function isLayerColorKey(value: unknown): value is LayerColorKey {
  return (
    typeof value === "string" &&
    Object.hasOwn(LAYER_COLOR_METADATA, value)
  );
}

export type ColorOverrides = Readonly<
  Record<
    ResolvedThemeMode,
    Readonly<Partial<Record<LayerColorKey, string>>>
  >
>;
