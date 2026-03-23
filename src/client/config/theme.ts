export type ThemeMode = "dark" | "light" | "auto";

export type ThemeColors = {
  bg: string;
  panel: string;
  border: string;
  accent: string;
  coast: string;
  coastFill: string;
  ocean: string;
  oceanDeep: string;
  grid: string;
  ships: string;
  aircraft: string;
  events: string;
  quakes: string;
  fires: string;
  weather: string;
  text: string;
  dim: string;
  bright: string;
  danger: string;
  warn: string;
};

export type Theme = {
  colors: ThemeColors;
};

export const themes: Record<ThemeMode, Theme> = {
  dark: {
    colors: {
      bg: "#080a0f",
      panel: "#0c1018",
      border: "#172033",
      accent: "#00d4f0",
      coast: "#1e4060",
      coastFill: "#0f1e2e",
      ocean: "#0e1825",
      oceanDeep: "#060c16",
      grid: "#172033",
      ships: "#00d4f0",
      aircraft: "#ffcc00",
      events: "#dd44aa",
      quakes: "#66ff44",
      fires: "#ff6600",
      weather: "#aa66ff",
      text: "#b0bec5",
      dim: "#556070",
      bright: "#e8eef4",
      danger: "#ff3333",
      warn: "#facc15",
    },
  },
  light: {
    colors: {
      bg: "#f0f2f5",
      panel: "#ffffff",
      border: "#b0bcc8",
      accent: "#006a90",
      coast: "#8a9aaa",
      coastFill: "#e8e0d4",
      ocean: "#ddeaf4",
      oceanDeep: "#c8daea",
      grid: "#4a5568",
      ships: "#7b2d8e",
      aircraft: "#1a8a6e",
      events: "#e62e8a",
      quakes: "#2b5fb3",
      fires: "#cc2200",
      weather: "#e07000",
      text: "#1a2530",
      dim: "#4a5a6a",
      bright: "#0a1018",
      danger: "#cc1111",
      warn: "#b45309",
    },
  },
};

/** The 6 layer color keys that users can customize */
export const LAYER_COLOR_KEYS = [
  "aircraft",
  "ships",
  "events",
  "quakes",
  "fires",
  "weather",
] as const;

export type LayerColorKey = (typeof LAYER_COLOR_KEYS)[number];

export const LAYER_COLOR_LABELS: Record<LayerColorKey, string> = {
  aircraft: "Aircraft",
  ships: "AIS Vessels",
  events: "GDELT Events",
  quakes: "Seismic",
  fires: "Fires",
  weather: "Weather",
};

/** Per-theme color overrides — only layer colors, not UI chrome */
export type ColorOverrides = {
  dark: Partial<Record<LayerColorKey, string>>;
  light: Partial<Record<LayerColorKey, string>>;
};

/** Merge user overrides into a theme's colors */
export function applyColorOverrides(
  base: ThemeColors,
  overrides: Partial<Record<LayerColorKey, string>> | undefined,
): ThemeColors {
  if (!overrides) return base;
  return { ...base, ...overrides };
}

/** Color map keyed by feature id */
export function getColorMap(theme: Theme): Record<string, string> {
  return {
    ships: theme.colors.ships,
    aircraft: theme.colors.aircraft,
    events: theme.colors.events,
    quakes: theme.colors.quakes,
    fires: theme.colors.fires,
    weather: theme.colors.weather,
  };
}

export function applyThemeToRoot(theme: Theme) {
  const root = document.documentElement;
  const { colors } = theme;

  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--sigint-${key}`, value);
  });
}
