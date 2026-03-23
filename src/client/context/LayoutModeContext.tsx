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
};

const LayoutModeContext = createContext<LayoutModeContextValue | undefined>(
  undefined,
);

// ── Helpers ──────────────────────────────────────────────────────────

function computeIsMobile(mode: LayoutMode, width: number): boolean {
  if (mode === "mobile") return true;
  if (mode === "desktop") return false;
  return width < 768;
}

const CYCLE_ORDER: LayoutMode[] = ["auto", "mobile", "desktop"];

// ── Provider ─────────────────────────────────────────────────────────

export function LayoutModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<LayoutMode>("auto");
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1024,
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

  // Track window resize
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
    () => computeIsMobile(mode, windowWidth),
    [mode, windowWidth],
  );

  const value = useMemo<LayoutModeContextValue>(
    () => ({ mode, setMode, cycleMode, isMobile }),
    [mode, setMode, cycleMode, isMobile],
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
