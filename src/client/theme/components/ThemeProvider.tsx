import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CacheKey } from "@shared/domain/cache";
import { cacheGet, cacheSet } from "@/lib/cache";
import { DomEvent } from "@/runtime";
import { ThemeContext, type ThemeContextValue } from "../model/context";
import { ThemeMode, isThemeMode, type ResolvedThemeMode } from "../model/themeMode";
import { themes, type ColorOverrides, type LayerColorKey } from "../model/colors";
import { applyColorOverrides, createEmptyOverrides } from "../utils/colors";
import { applyThemeToRoot } from "../utils/stylesheet";
import { resolveThemeMode, systemThemeMediaQuery } from "../utils/mode";

async function loadOverrides(): Promise<ColorOverrides | null> {
  const saved = await cacheGet<ColorOverrides>(CacheKey.ColorOverrides);
  if (
    !saved ||
    typeof saved !== "object" ||
    !saved[ThemeMode.Dark] ||
    !saved[ThemeMode.Light]
  ) {
    return null;
  }
  return saved;
}

export function ThemeProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [modeState, setModeState] = useState(ThemeMode.Dark);
  const [systemPreference, setSystemPreference] =
    useState<ResolvedThemeMode>(() => resolveThemeMode(ThemeMode.Auto));
  const [colorOverrides, setColorOverrides] = useState<ColorOverrides>(
    createEmptyOverrides,
  );

  useEffect(() => {
    let mounted = true;
    cacheGet<ThemeMode>(CacheKey.Theme).then((savedMode) => {
      if (mounted && isThemeMode(savedMode)) setModeState(savedMode);
    });
    loadOverrides().then((savedOverrides) => {
      if (mounted && savedOverrides) setColorOverrides(savedOverrides);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = systemThemeMediaQuery();
    if (!mediaQuery) return;
    const handlePreferenceChange = (event: MediaQueryListEvent) => {
      setSystemPreference(
        event.matches ? ThemeMode.Light : ThemeMode.Dark,
      );
    };
    mediaQuery.addEventListener(DomEvent.Change, handlePreferenceChange);
    return () =>
      mediaQuery.removeEventListener(
        DomEvent.Change,
        handlePreferenceChange,
      );
  }, []);

  const resolvedMode =
    modeState === ThemeMode.Auto ? systemPreference : modeState;
  const theme = useMemo(() => {
    const base = themes[resolvedMode];
    return {
      colors: applyColorOverrides(
        base.colors,
        colorOverrides[resolvedMode],
      ),
    };
  }, [colorOverrides, resolvedMode]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    cacheSet(CacheKey.Theme, nextMode);
  }, []);

  const setLayerColor = useCallback(
    (key: LayerColorKey, color: string) => {
      setColorOverrides((currentOverrides) => {
        const nextOverrides = {
          ...currentOverrides,
          [resolvedMode]: {
            ...currentOverrides[resolvedMode],
            [key]: color,
          },
        };
        cacheSet(CacheKey.ColorOverrides, nextOverrides);
        return nextOverrides;
      });
    },
    [resolvedMode],
  );

  const resetLayerColor = useCallback(
    (key: LayerColorKey) => {
      setColorOverrides((currentOverrides) => {
        const modeOverrides = { ...currentOverrides[resolvedMode] };
        delete modeOverrides[key];
        const nextOverrides = {
          ...currentOverrides,
          [resolvedMode]: modeOverrides,
        };
        cacheSet(CacheKey.ColorOverrides, nextOverrides);
        return nextOverrides;
      });
    },
    [resolvedMode],
  );

  const resetAllColors = useCallback(() => {
    const nextOverrides = createEmptyOverrides();
    setColorOverrides(nextOverrides);
    cacheSet(CacheKey.ColorOverrides, nextOverrides);
  }, []);

  useEffect(() => applyThemeToRoot(theme), [theme]);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      colorOverrides,
      mode: modeState,
      resetAllColors,
      resetLayerColor,
      resolvedMode,
      setLayerColor,
      setMode,
      theme,
    }),
    [
      colorOverrides,
      modeState,
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
