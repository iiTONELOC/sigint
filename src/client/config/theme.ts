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
  cyclones: string;
  /** Hurricane Hunter / recon aircraft — neon orange, distinct from fires. */
  recon: string;
  /** Tropical WARNING area fill (hurricane/TS/surge warning). */
  cycWarning: string;
  /** Tropical WATCH area fill (one step below a warning). */
  cycWatch: string;
  text: string;
  dim: string;
  bright: string;
  danger: string;
  warn: string;
};

export type Theme = {
  colors: ThemeColors;
};

// "auto" is not a concrete theme — it resolves to dark/light at runtime by
// system preference, so only the two real palettes live here.
export const themes: Record<"dark" | "light", Theme> = {
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
      // Map gridline tone — sits between border (#172033) and dim
      // (#556070) on the luminance ramp. The previous #172033 was
      // identical to border/bg and disappeared on the ocean tile.
      grid: "#3a4d66",
      ships: "#00d4f0",
      aircraft: "#ffcc00",
      events: "#dd44aa",
      quakes: "#66ff44",
      fires: "#ff6600",
      weather: "#aa66ff",
      cyclones: "#ff2b3d",
      // Neon amber — brighter/yellower than fires (#ff6600) so recon birds
      // stand apart from fire dots on the dark globe.
      recon: "#ff9500",
      // Warning = hot magenta-red (pinker than cyclone red #ff2b3d so the
      // area fill reads apart from the storm marker); watch = amber.
      cycWarning: "#ff1a6e",
      cycWatch: "#ffb300",
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
      cyclones: "#a3001a",
      // Deep amber — readable on the light background, distinct from the
      // red-leaning light fires (#cc2200) and weather orange (#e07000).
      recon: "#b86b00",
      // Warning = deep magenta-red; watch = deep amber. Both legible on the
      // light background and distinct from cyclone red (#a3001a).
      cycWarning: "#c2185b",
      cycWatch: "#b45309",
      text: "#1a2530",
      dim: "#4a5a6a",
      bright: "#0a1018",
      danger: "#cc1111",
      warn: "#b45309",
    },
  },
};

/** The 7 layer color keys that users can customize */
export const LAYER_COLOR_KEYS = [
  "aircraft",
  "ships",
  "events",
  "quakes",
  "fires",
  "weather",
  "cyclones",
] as const;

export type LayerColorKey = (typeof LAYER_COLOR_KEYS)[number];

export const LAYER_COLOR_LABELS: Record<LayerColorKey, string> = {
  aircraft: "Aircraft",
  ships: "AIS Vessels",
  events: "GDELT Events",
  quakes: "Seismic",
  fires: "Fires",
  weather: "Weather",
  cyclones: "Tropical Cyclones",
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
    cyclones: theme.colors.cyclones,
    // Defined so consumers reading colorMap by raw type don't get undefined
    // (which renders black). Forecast points share the cyclones color.
    "cyclones-forecast": theme.colors.cyclones,
  };
}

export function applyThemeToRoot(theme: Theme) {
  const root = document.documentElement;
  const { colors } = theme;

  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--sigint-${key}`, value);
  });
}
