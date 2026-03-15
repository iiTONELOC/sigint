export type ThemeMode = "dark" | "light";

export type ThemeColors = {
  bg: string;
  panel: string;
  border: string;
  accent: string;
  coast: string;
  coastFill: string;
  ships: string;
  aircraft: string;
  events: string;
  quakes: string;
  text: string;
  dim: string;
  bright: string;
  danger: string;
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
      ships: "#00d4f0",
      aircraft: "#ffcc00",
      events: "#ff4422",
      quakes: "#66ff44",
      text: "#b0bec5",
      dim: "#556070",
      bright: "#e8eef4",
      danger: "#ff3333",
    },
  },
  light: {
    colors: {
      bg: "#f0f2f5",
      panel: "#ffffff",
      border: "#d0d7e0",
      accent: "#0090b8",
      coast: "#7aaccc",
      coastFill: "#dce8f0",
      ships: "#0090b8",
      aircraft: "#cc8800",
      events: "#cc2200",
      quakes: "#228800",
      text: "#3a4550",
      dim: "#8898a8",
      bright: "#0a1018",
      danger: "#cc1111",
    },
  },
};

/** Color map keyed by feature id */
export function getColorMap(theme: Theme): Record<string, string> {
  return {
    ships: theme.colors.ships,
    aircraft: theme.colors.aircraft,
    events: theme.colors.events,
    quakes: theme.colors.quakes,
  };
}

export function applyThemeToRoot(theme: Theme) {
  const root = document.documentElement;
  const { colors } = theme;

  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--sigint-${key}`, value);
  });
}
