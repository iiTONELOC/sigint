import { useState, useEffect } from "react";
import { useData } from "@/context/DataContext";
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
} from "@/panes/paneLayoutContext";
import { cacheGet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

export function AppShell() {
  const {
    allData,
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

  // ── Walkthrough state ──────────────────────────────────────────
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [walkthroughMode, setWalkthroughMode] =
    useState<WalkthroughLaunchMode>("both");

  useEffect(() => {
    setWalkthroughActive(showWalkthrough);
  }, [showWalkthrough]);

  // Listen for walkthrough launch from SettingsModal
  useEffect(() => {
    return onWalkthroughLaunch((mode) => {
      setWalkthroughMode(mode);
      setShowWalkthrough(true);
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    // Check if walkthrough was already completed
    cacheGet<boolean>(CACHE_KEYS.walkthroughComplete).then((done) => {
      if (!mounted) return;
      if (!done) {
        // Delay to let data load and globe render before overlay
        const timer = setTimeout(() => {
          if (mounted) setShowWalkthrough(true);
        }, 2500);
        return () => clearTimeout(timer);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

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
              data={allData}
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
        <div
          data-tour="ticker"
          className="shrink-0 px-2 md:px-3 pt-0.5 md:pt-1 pb-1 md:pb-2 border-t border-sig-border bg-sig-panel/95"
          style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
        >
          <div className="tracking-wider mb-0.5 hidden md:flex items-center gap-1.5 text-sig-dim text-(length:--sig-text-md)">
            <span className="text-sig-danger animate-[pulse_1.5s_infinite]">
              ●
            </span>{" "}
            LIVE FEED
          </div>
          <Ticker items={tickerItems} />
        </div>
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
