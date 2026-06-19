// ── Layout Mode Context ──────────────────────────────────────────────
// Controls whether the app renders mobile or desktop layout.
//
// Three modes:
//   "auto"    — viewport width < 768 = mobile (default, current behavior)
//   "mobile"  — force mobile layout regardless of viewport
//   "desktop" — force desktop layout regardless of viewport
//
// Persisted to IndexedDB under CACHE_KEYS.layoutMode.
// Wrap the app in <LayoutModeProvider> above AppShell.
// Consumers call useLayoutMode() for the mode + setter,
// or useIsMobileLayout() for the effective boolean.

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

// ── Types ────────────────────────────────────────────────────────────

export type LayoutMode = "auto" | "mobile" | "desktop";

type LayoutModeContextValue = {
  /** Current mode setting */
  mode: LayoutMode;
  /** Set mode — persists to IndexedDB */
  setMode: (mode: LayoutMode) => void;
  /** Cycle to next mode: auto → mobile → desktop → auto */
  cycleMode: () => void;
  /** Effective boolean — the single source of truth for "is mobile layout" */
  isMobile: boolean;
  /** The detected device, independent of the chosen layout/orientation */
  deviceType: DeviceType;
};

const LayoutModeContext = createContext<LayoutModeContextValue | undefined>(
  undefined,
);

// ── Helpers ──────────────────────────────────────────────────────────

export type DeviceType = "phone" | "tablet" | "desktop";

// Device type from the user-agent. iPadOS 13+ reports as desktop Safari, so a
// MacIntel platform with touch points is treated as a tablet.
export function detectDeviceType(): DeviceType {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  const uaData = (navigator as { userAgentData?: { mobile?: boolean } })
    .userAgentData;
  if (
    /iPhone|iPod|Windows Phone/i.test(ua) ||
    (/Android/i.test(ua) && /Mobile/i.test(ua)) ||
    uaData?.mobile === true
  ) {
    return "phone";
  }
  if (
    /iPad|Tablet|PlayBook|Silk/i.test(ua) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua)) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "tablet";
  }
  return "desktop";
}

// The device type chooses the deciding factor: a phone is mobile in portrait,
// desktop grid in landscape (the wide-short viewport suits the grid); tablets
// and desktops use the grid. The header toggle (layoutMode) overrides any of it.
function computeIsMobile(
  mode: LayoutMode,
  device: DeviceType,
  portrait: boolean,
): boolean {
  if (mode === "mobile") return true;
  if (mode === "desktop") return false;
  if (device === "phone") return portrait;
  return false;
}

const CYCLE_ORDER: LayoutMode[] = ["auto", "mobile", "desktop"];

// ── Provider ─────────────────────────────────────────────────────────

export function LayoutModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<LayoutMode>("auto");
  const [deviceType] = useState<DeviceType>(detectDeviceType);
  const [portrait, setPortrait] = useState(() =>
    typeof window !== "undefined"
      ? window.innerHeight >= window.innerWidth
      : true,
  );

  // Hydrate from IndexedDB on mount
  useEffect(() => {
    let mounted = true;
    cacheGet<string>(CACHE_KEYS.layoutMode).then((saved) => {
      if (!mounted) return;
      if (saved === "mobile" || saved === "desktop" || saved === "auto") {
        setModeState(saved);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Track window resize.
  //
  // Skip updates while the document has a fullscreen element. Rotating
  // a phone in landscape crosses the 768 px breakpoint, which would
  // otherwise flip `isMobile` false, swap PaneMobile for the desktop
  // tree, unmount the playing <video>, and force the browser to exit
  // fullscreen — even though the user just rotated to make the video
  // bigger. Holding the width steady keeps the same React tree mounted
  // so fullscreen survives the rotation. On `fullscreenchange` (exit)
  // we resync to the now-current width.
  useEffect(() => {
    const sync = () => setPortrait(window.innerHeight >= window.innerWidth);
    const onResize = () => {
      if (document.fullscreenElement) return;
      sync();
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) sync();
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const setMode = useCallback((next: LayoutMode) => {
    setModeState(next);
    cacheSet(CACHE_KEYS.layoutMode, next);
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const idx = CYCLE_ORDER.indexOf(prev);
      const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]!;
      cacheSet(CACHE_KEYS.layoutMode, next);
      return next;
    });
  }, []);

  const isMobile = useMemo(
    () => computeIsMobile(mode, deviceType, portrait),
    [mode, deviceType, portrait],
  );

  const value = useMemo<LayoutModeContextValue>(
    () => ({ mode, setMode, cycleMode, isMobile, deviceType }),
    [mode, setMode, cycleMode, isMobile, deviceType],
  );

  return (
    <LayoutModeContext.Provider value={value}>
      {children}
    </LayoutModeContext.Provider>
  );
}

// ── Hooks ────────────────────────────────────────────────────────────

export function useLayoutMode(): LayoutModeContextValue {
  const ctx = useContext(LayoutModeContext);
  if (!ctx) {
    throw new Error("useLayoutMode must be used within LayoutModeProvider");
  }
  return ctx;
}

/** Convenience hook — just the boolean */
export function useIsMobileLayout(): boolean {
  return useLayoutMode().isMobile;
}
