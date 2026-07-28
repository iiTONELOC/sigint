import { useState, useEffect } from "react";
import { useData } from "@/context/DataContext";
import { useIsMobileLayout } from "@/context/LayoutModeContext";
import { Header } from "@/components/Header";
import { Search } from "@/components/Search";
import { Ticker } from "@/components/Ticker";
import { PaneManager } from "@/panes/PaneManager";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { Walkthrough } from "@/components/Walkthrough";
import {
  setWalkthroughActive,
  onWalkthroughLaunch,
  type WalkthroughLaunchMode,
} from "@/lib/runtime/layoutSignals";
import { cacheGet, cacheSet } from "@/lib/cache/storageService";
import { cacheGetEnum } from "@/lib/cache/cacheEnum";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { GripHorizontal } from "lucide-react";

enum TickerMode {
  Full = "full",
  Compact = "compact",
  Collapsed = "collapsed",
}

/** Desktop steps through all three heights; the table is the whole cycle. */
const DESKTOP_TICKER_CYCLE: Readonly<Record<TickerMode, TickerMode>> = {
  [TickerMode.Full]: TickerMode.Compact,
  [TickerMode.Compact]: TickerMode.Collapsed,
  [TickerMode.Collapsed]: TickerMode.Full,
};

function mobileTickerMode(previous: TickerMode): TickerMode {
  return previous === TickerMode.Collapsed
    ? TickerMode.Compact
    : TickerMode.Collapsed;
}

export function AppShell() {
  const {
    layers,
    toggleLayer,
    counts,
    aircraftFilter,
    setAircraftFilter,
    availableCountries,
    chromeHidden,
    tickerItems,
    dataSources,
    handleSearchSelect,
    handleSearchZoomTo,
    handleSearchMatchIds,
  } = useData();

  const isMobileLayout = useIsMobileLayout();

  // ── Walkthrough state ──────────────────────────────────────────
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [walkthroughMode, setWalkthroughMode] =
    useState<WalkthroughLaunchMode>("both");

  useEffect(() => {
    setWalkthroughActive(showWalkthrough);
  }, [showWalkthrough]);

  // Listen for walkthrough launch from SettingsModal
  useEffect(() => {
    const unsub = onWalkthroughLaunch((mode) => {
      setWalkthroughMode(mode);
      setShowWalkthrough(true);
    });
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    cacheGet<boolean>(CACHE_KEYS.walkthroughComplete).then((done) => {
      if (!mounted) return;
      if (!done) {
        timer = setTimeout(() => {
          if (mounted) setShowWalkthrough(true);
        }, 2500);
      }
    });
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // ── Ticker height mode ──────────────────────────────────────────
  const [tickerMode, setTickerMode] = useState<TickerMode>(
    TickerMode.Collapsed,
  );

  useEffect(() => {
    cacheGetEnum(CACHE_KEYS.tickerHeight, TickerMode).then((saved) => {
      if (saved) {
        setTickerMode(saved);
      } else if (isMobileLayout) {
        setTickerMode(TickerMode.Collapsed);
      }
    });
  }, [isMobileLayout]);

  const cycleTickerMode = () => {
    setTickerMode((prev) => {
      // Mobile only toggles show/hide, so it is always compact when visible.
      const next = isMobileLayout
        ? mobileTickerMode(prev)
        : DESKTOP_TICKER_CYCLE[prev];
      cacheSet(CACHE_KEYS.tickerHeight, next);
      return next;
    });
  };

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <ConnectionStatus />

      {/* ── HEADER ── */}
      {!chromeHidden && (
        <Header
          layers={layers}
          toggleLayer={toggleLayer}
          counts={counts}
          dataSources={dataSources}
          aircraftFilter={aircraftFilter}
          setAircraftFilter={setAircraftFilter}
          availableCountries={availableCountries}
          searchSlot={
            <Search
              onSelect={handleSearchSelect}
              onZoomTo={handleSearchZoomTo}
              onMatchingIdsChange={handleSearchMatchIds}
            />
          }
        />
      )}

      {/* ── PANE AREA ── */}
      <div className="flex-1 relative overflow-hidden">
        <PaneManager />
      </div>

      {/* ── TICKER ── */}
      {!chromeHidden && (
        <>
          {/* Ticker content */}
          {tickerMode !== TickerMode.Collapsed ? (
            <div
              data-tour="ticker"
              className={`shrink-0 px-2 md:px-3 border-t border-sig-border bg-sig-panel/95 ${
                tickerMode === TickerMode.Compact
                  ? "py-0.5"
                  : "pt-0.5 md:pt-1 pb-1 md:pb-2"
              }`}
              style={{
                paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))",
              }}
            >
              <div className="tracking-wider mb-0.5 flex items-center gap-1.5 text-sig-dim text-(length:--sig-text-md)">
                <span className="text-sig-danger animate-[pulse_1.5s_infinite] hidden md:inline">
                  ●
                </span>
                <span className="hidden md:inline">LIVE FEED</span>
                <button
                  onClick={cycleTickerMode}
                  className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim/50 hover:text-sig-accent/60 transition-colors cursor-pointer bg-transparent border-none group touch-target"
                >
                  <GripHorizontal
                    size={10}
                    className="group-hover:text-sig-accent/60"
                  />
                  <span className="text-[9px] tracking-widest font-semibold">
                    {tickerMode === TickerMode.Full ? "COMPACT" : "HIDE"}
                  </span>
                </button>
              </div>
              <Ticker
                items={tickerItems}
                compact={tickerMode === TickerMode.Compact}
              />
            </div>
          ) : (
            <button
              type="button"
              title="Show live feed"
              className="w-full shrink-0 border-t border-sig-border bg-sig-panel/95 cursor-pointer hover:bg-sig-accent/5 transition-colors"
              style={{
                paddingBottom: "env(safe-area-inset-bottom)",
              }}
              onClick={cycleTickerMode}
            >
              <div className="flex items-center justify-center gap-1.5 py-0.5 text-sig-dim/50 hover:text-sig-accent/60">
                <GripHorizontal size={10} />
                <span className="text-[9px] tracking-widest font-semibold">
                  SHOW LIVE FEED
                </span>
                <GripHorizontal size={10} />
              </div>
            </button>
          )}
        </>
      )}

      {/* ── WALKTHROUGH OVERLAY ── */}
      {showWalkthrough && (
        <Walkthrough
          startMode={walkthroughMode}
          onComplete={() => setShowWalkthrough(false)}
        />
      )}
    </div>
  );
}
