import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { type ThemeMode, themes, applyThemeToRoot } from "@/config/theme";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

type ThemeContextType = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  theme: (typeof themes)[ThemeMode];
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeRaw] = useState<ThemeMode>(() => {
    const saved = cacheGet<ThemeMode>(CACHE_KEYS.theme);
    return saved === "light" ? "light" : "dark";
  });
  const theme = themes[mode];

  const setMode = useCallback((next: ThemeMode) => {
    setModeRaw(next);
    cacheSet(CACHE_KEYS.theme, next);
  }, []);

  useEffect(() => {
    applyThemeToRoot(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ mode, setMode, theme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
