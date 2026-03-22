import { useData } from "@/context/DataContext";
import { Header } from "@/components/Header";
import { Search } from "@/components/Search";
import { Ticker } from "@/components/Ticker";
import { PaneManager } from "@/panes/PaneManager";
import { ConnectionStatus } from "@/components/ConnectionStatus";

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
    </div>
  );
}
