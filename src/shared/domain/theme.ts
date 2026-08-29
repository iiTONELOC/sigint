export enum ThemeColorKey {
  Background = "bg",
  Panel = "panel",
  Border = "border",
  Accent = "accent",
  Coast = "coast",
  CoastFill = "coastFill",
  Ocean = "ocean",
  OceanDeep = "oceanDeep",
  Grid = "grid",
  Ships = "ships",
  Aircraft = "aircraft",
  AircraftEmergency = "aircraftEmergency",
  AircraftHijack = "aircraftHijack",
  AircraftRadioFailure = "aircraftRadioFailure",
  Events = "events",
  Quakes = "quakes",
  Fires = "fires",
  Weather = "weather",
  Cyclones = "cyclones",
  Recon = "recon",
  Military = "military",
  CycloneWarning = "cycWarning",
  CycloneWatch = "cycWatch",
  Text = "text",
  Dim = "dim",
  Bright = "bright",
  Danger = "danger",
  Warning = "warn",
}

const UI_ONLY_THEME_COLOR_POLICY = Object.freeze({
  [ThemeColorKey.Panel]: true,
  [ThemeColorKey.Border]: true,
  [ThemeColorKey.Text]: true,
  [ThemeColorKey.Danger]: true,
  [ThemeColorKey.Warning]: true,
} satisfies Partial<Record<ThemeColorKey, boolean>>);

export type RenderThemeColorKey = Exclude<
  ThemeColorKey,
  keyof typeof UI_ONLY_THEME_COLOR_POLICY
>;

export const RENDER_THEME_COLOR_KEYS: readonly RenderThemeColorKey[] =
  Object.values(ThemeColorKey).filter(
    (key): key is RenderThemeColorKey =>
      !Object.hasOwn(UI_ONLY_THEME_COLOR_POLICY, key),
  );

export type RenderWorkerColors = Readonly<
  Record<RenderThemeColorKey, string>
>;
