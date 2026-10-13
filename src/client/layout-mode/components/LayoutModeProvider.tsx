import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cacheGet, cacheSet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";
import { LayoutMode } from "../model/layoutMode";
import { detectDeviceType } from "../utils/device";
import {
  nextLayoutMode,
  parseLayoutMode,
  usesMobileLayout,
} from "../utils/layout";
import { LayoutModeContext, type LayoutModeContextValue } from "./context";

export function LayoutModeProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [mode, setMode] = useState(LayoutMode.Auto);
  const deviceType = useMemo(detectDeviceType, []);

  useEffect(() => {
    let mounted = true;
    cacheGet<unknown>(CacheKey.LayoutMode).then((saved) => {
      if (!mounted) {
        return;
      }
      const persistedMode = parseLayoutMode(saved);
      if (persistedMode !== null) {
        setMode(persistedMode);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const updateMode = useCallback((next: LayoutMode) => {
    setMode(next);
    cacheSet(CacheKey.LayoutMode, next);
  }, []);

  const cycleMode = useCallback(() => {
    setMode((previous) => {
      const next = nextLayoutMode(previous);
      cacheSet(CacheKey.LayoutMode, next);
      return next;
    });
  }, []);

  const isMobile = useMemo(
    () => usesMobileLayout(mode, deviceType),
    [deviceType, mode],
  );

  const value = useMemo<LayoutModeContextValue>(
    () => ({
      cycleMode,
      deviceType,
      isMobile,
      mode,
      setMode: updateMode,
    }),
    [cycleMode, deviceType, isMobile, mode, updateMode],
  );

  return (
    <LayoutModeContext.Provider value={value}>
      {children}
    </LayoutModeContext.Provider>
  );
}
