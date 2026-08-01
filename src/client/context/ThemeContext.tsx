import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  type ColorOverrides,
  type LayerColorKey,
  type Theme,
  themes,
  applyThemeToRoot,
  applyColorOverrides,
} from "@/config/theme";
import { cacheGet, cacheSet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";
import {
  isThemeMode,
  ThemeMode,
  type ResolvedThemeMode,
} from "@/theme";
import { DomEvent } from "@/runtime";

enum ThemeContextErrorMessage {
  ProviderRequired = "useTheme must be used within ThemeProvider",
}

enum ThemePreferenceMediaQuery {
  Light = "(prefers-color-scheme: light)",
}

function resolveMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode !== ThemeMode.Auto) {
    return mode;
  }
  if (typeof window === "undefined") {
    return ThemeMode.Dark;
  }
  return window.matchMedia(ThemePreferenceMediaQuery.Light).matches
    ? ThemeMode.Light
    : ThemeMode.Dark;
}

type ThemeContextType = {
  mode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  setMode: (mode: ThemeMode) => void;
  theme: Theme;
  colorOverrides: ColorOverrides;
  setLayerColor: (key: LayerColorKey, color: string) => void;
  resetLayerColor: (key: LayerColorKey) => void;
  resetAllColors: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function createEmptyOverrides(): ColorOverrides {
  return {
    [ThemeMode.Dark]: {},
    [ThemeMode.Light]: {},
  };
}

async function loadOverrides(): Promise<ColorOverrides | null> {
  const saved = await cacheGet<ColorOverrides>(CacheKey.ColorOverrides);
  if (
    saved &&
    typeof saved === "object" &&
    saved[ThemeMode.Dark] &&
    saved[ThemeMode.Light]
  ) {
    return saved;
  }
  return null;
}

export function ThemeProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [modeState, setModeState] = useState<ThemeMode>(ThemeMode.Dark);
  const [systemPreference, setSystemPreference] = useState<ResolvedThemeMode>(
    () => resolveMode(ThemeMode.Auto),
  );
  const [overrides, setOverrides] = useState<ColorOverrides>(
    createEmptyOverrides,
  );

  useEffect(() => {
    let mounted = true;
    const modeP = cacheGet<ThemeMode>(CacheKey.Theme);
    const overridesP = loadOverrides();
    modeP.then((savedMode) => {
      if (!mounted) return;
      if (isThemeMode(savedMode)) {
        setModeState(savedMode);
      }
    });
    overridesP.then((savedOverrides) => {
      if (mounted && savedOverrides) {
        setOverrides(savedOverrides);
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(ThemePreferenceMediaQuery.Light);
    const handler = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? ThemeMode.Light : ThemeMode.Dark);
    };
    mql.addEventListener(DomEvent.Change, handler);
    return () => mql.removeEventListener(DomEvent.Change, handler);
  }, []);

  const resolvedMode: ResolvedThemeMode =
    modeState === ThemeMode.Auto ? systemPreference : modeState;

  const theme = useMemo(() => {
    const base = themes[resolvedMode];
    const modeOverrides = overrides[resolvedMode];
    const merged = applyColorOverrides(base.colors, modeOverrides);
    return { colors: merged };
  }, [resolvedMode, overrides]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    cacheSet(CacheKey.Theme, next);
  }, []);

  const setLayerColor = useCallback(
    (key: LayerColorKey, color: string) => {
      setOverrides((prev) => {
        const next = {
          ...prev,
          [resolvedMode]: { ...prev[resolvedMode], [key]: color },
        };
        cacheSet(CacheKey.ColorOverrides, next);
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
        cacheSet(CacheKey.ColorOverrides, next);
        return next;
      });
    },
    [resolvedMode],
  );

  const resetAllColors = useCallback(() => {
    const emptyOverrides = createEmptyOverrides();
    setOverrides(emptyOverrides);
    cacheSet(CacheKey.ColorOverrides, emptyOverrides);
  }, []);

  useEffect(() => {
    applyThemeToRoot(theme);
  }, [theme]);

  const contextValue = useMemo<ThemeContextType>(
    () => ({
      mode: modeState,
      resolvedMode,
      setMode,
      theme,
      colorOverrides: overrides,
      setLayerColor,
      resetLayerColor,
      resetAllColors,
    }),
    [
      modeState,
      overrides,
      resetAllColors,
      resetLayerColor,
      resolvedMode,
      setLayerColor,
      setMode,
      theme,
    ],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error(ThemeContextErrorMessage.ProviderRequired);
  }
  return context;
}
