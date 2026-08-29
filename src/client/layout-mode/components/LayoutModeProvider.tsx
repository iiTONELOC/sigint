import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cacheGet, cacheSet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";
import { DomEvent } from "@/runtime";
import { LayoutMode, ViewportOrientation } from "../model/layoutMode";
import { detectDeviceType } from "../utils/device";
import {
  nextLayoutMode,
  parseLayoutMode,
  usesMobileLayout,
  viewportOrientation,
} from "../utils/layout";
import { LayoutModeContext, type LayoutModeContextValue } from "./context";

function currentOrientation(): ViewportOrientation {
  if (typeof window === "undefined") {
    return ViewportOrientation.Portrait;
  }
  return viewportOrientation(window.innerWidth, window.innerHeight);
}

export function LayoutModeProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [mode, setMode] = useState(LayoutMode.Auto);
  const deviceType = useMemo(detectDeviceType, []);
  const [orientation, setOrientation] =
    useState<ViewportOrientation>(currentOrientation);

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

  useEffect(() => {
    const syncOrientation = () => {
      setOrientation(currentOrientation());
    };
    const onViewportChange = () => {
      if (!document.fullscreenElement) {
        syncOrientation();
      }
    };

    window.addEventListener(DomEvent.Resize, onViewportChange);
    document.addEventListener(
      DomEvent.FullscreenChange,
      onViewportChange,
    );
    return () => {
      window.removeEventListener(DomEvent.Resize, onViewportChange);
      document.removeEventListener(
        DomEvent.FullscreenChange,
        onViewportChange,
      );
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
    () => usesMobileLayout(mode, deviceType, orientation),
    [deviceType, mode, orientation],
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
