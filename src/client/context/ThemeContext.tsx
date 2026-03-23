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

/** Resolve "auto" to the actual dark/light based on system preference */
function resolveMode(mode: ThemeMode): "dark" | "light" {
  if (mode !== "auto") return mode;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

type ThemeContextType = {
  /** The user's chosen setting: "dark" | "light" | "auto" */
  mode: ThemeMode;
  /** The resolved mode actually applied: "dark" | "light" */
  resolvedMode: "dark" | "light";
  setMode: (mode: ThemeMode) => void;
  theme: (typeof themes)["dark" | "light"];
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
  const [systemPreference, setSystemPreference] = useState<"dark" | "light">(
    () => resolveMode("auto"),
  );
  const [overrides, setOverrides] = useState<ColorOverrides>(EMPTY_OVERRIDES);

  // Load persisted theme + overrides in parallel
  useEffect(() => {
    let mounted = true;
    const modeP = cacheGet<ThemeMode>(CACHE_KEYS.theme);
    const overridesP = loadOverrides();
    modeP.then((savedMode) => {
      if (!mounted) return;
      if (savedMode === "light" || savedMode === "dark" || savedMode === "auto") {
        setModeRaw(savedMode);
      }
    });
    overridesP.then((savedOverrides) => {
      if (mounted) setOverrides(savedOverrides);
    });
    return () => { mounted = false; };
  }, []);

  // Listen for system color scheme changes (only matters when mode === "auto")
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? "light" : "dark");
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const resolvedMode: "dark" | "light" =
    mode === "auto" ? systemPreference : mode;

  const theme = useMemo(() => {
    const base = themes[resolvedMode];
    const modeOverrides = overrides[resolvedMode];
    const merged = applyColorOverrides(base.colors, modeOverrides);
    return { colors: merged };
  }, [resolvedMode, overrides]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeRaw(next);
    cacheSet(CACHE_KEYS.theme, next);
  }, []);

  const setLayerColor = useCallback(
    (key: LayerColorKey, color: string) => {
      setOverrides((prev) => {
        const next = {
          ...prev,
          [resolvedMode]: { ...prev[resolvedMode], [key]: color },
        };
        cacheSet(CACHE_KEYS.colorOverrides, next);
        return next;
      });
    },
    [resolvedMode],
  );

  const resetLayerColor = useCallback(
    (key: LayerColorKey) => {
      setOverrides((prev) => {
        const modeOverrides = { ...prev[resolvedMode] };
        delete modeOverrides[key];
        const next = { ...prev, [resolvedMode]: modeOverrides };
        cacheSet(CACHE_KEYS.colorOverrides, next);
        return next;
      });
    },
    [resolvedMode],
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
        resolvedMode,
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
