import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  type ThemeMode,
  type ColorOverrides,
  type LayerColorKey,
  themes,
  applyThemeToRoot,
  applyColorOverrides,
} from "@/config/theme";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

type ThemeContextType = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  theme: (typeof themes)[ThemeMode];
  colorOverrides: ColorOverrides;
  setLayerColor: (key: LayerColorKey, color: string) => void;
  resetLayerColor: (key: LayerColorKey) => void;
  resetAllColors: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const EMPTY_OVERRIDES: ColorOverrides = { dark: {}, light: {} };

async function loadOverrides(): Promise<ColorOverrides> {
  const saved = await cacheGet<ColorOverrides>(CACHE_KEYS.colorOverrides);
  if (saved && typeof saved === "object" && saved.dark && saved.light) {
    return saved;
  }
  return EMPTY_OVERRIDES;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeRaw] = useState<ThemeMode>("dark");
  const [overrides, setOverrides] = useState<ColorOverrides>(EMPTY_OVERRIDES);

  // Load persisted theme + overrides in parallel
  useEffect(() => {
    let mounted = true;
    const modeP = cacheGet<ThemeMode>(CACHE_KEYS.theme);
    const overridesP = loadOverrides();
    modeP.then((savedMode) => {
      if (mounted && savedMode === "light") setModeRaw("light");
    });
    overridesP.then((savedOverrides) => {
      if (mounted) setOverrides(savedOverrides);
    });
    return () => { mounted = false; };
  }, []);

  const theme = useMemo(() => {
    const base = themes[mode];
    const modeOverrides = overrides[mode];
    const merged = applyColorOverrides(base.colors, modeOverrides);
    return { colors: merged };
  }, [mode, overrides]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeRaw(next);
    cacheSet(CACHE_KEYS.theme, next);
  }, []);

  const setLayerColor = useCallback(
    (key: LayerColorKey, color: string) => {
      setOverrides((prev) => {
        const next = {
          ...prev,
          [mode]: { ...prev[mode], [key]: color },
        };
        cacheSet(CACHE_KEYS.colorOverrides, next);
        return next;
      });
    },
    [mode],
  );

  const resetLayerColor = useCallback(
    (key: LayerColorKey) => {
      setOverrides((prev) => {
        const modeOverrides = { ...prev[mode] };
        delete modeOverrides[key];
        const next = { ...prev, [mode]: modeOverrides };
        cacheSet(CACHE_KEYS.colorOverrides, next);
        return next;
      });
    },
    [mode],
  );

  const resetAllColors = useCallback(() => {
    setOverrides(EMPTY_OVERRIDES);
    cacheSet(CACHE_KEYS.colorOverrides, EMPTY_OVERRIDES);
  }, []);

  useEffect(() => {
    applyThemeToRoot(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        setMode,
        theme,
        colorOverrides: overrides,
        setLayerColor,
        resetLayerColor,
        resetAllColors,
      }}
    >
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
