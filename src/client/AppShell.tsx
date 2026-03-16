import { useCallback } from "react";
import { useData } from "@/context/DataContext";
import type { DataPoint } from "@/features/base/dataPoints";
import { Header } from "@/components/Header";
import { Search } from "@/components/Search";
import { Ticker } from "@/components/Ticker";
import { PaneManager } from "@/panes/PaneManager";

export function AppShell() {
  const {
    allData,
    layers,
    toggleLayer,
    counts,
    flat,
    setFlat,
    autoRotate,
    setAutoRotate,
    rotationSpeed,
    setRotationSpeed,
    aircraftFilter,
    setAircraftFilter,
    availableCountries,
    chromeHidden,
    tickerItems,
    setSelected,
    setZoomToId,
    handleSearchSelect,
    handleSearchZoomTo,
    handleSearchMatchIds,
  } = useData();

  const handleTickerSelect = useCallback(
    (item: DataPoint) => {
      setSelected(item);
      setZoomToId(item.id);
      setTimeout(() => setZoomToId(null), 100);
    },
    [setSelected, setZoomToId],
  );

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* ── HEADER ── */}
      {!chromeHidden && (
        <Header
          layers={layers}
          toggleLayer={toggleLayer}
          counts={counts}
          flat={flat}
          setFlat={setFlat}
          autoRotate={autoRotate}
          setAutoRotate={setAutoRotate}
          rotationSpeed={rotationSpeed}
          setRotationSpeed={setRotationSpeed}
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
        <div className="shrink-0 px-3 pt-1 pb-2 border-t border-sig-border bg-sig-panel/95">
          <div className="tracking-wider mb-0.5 flex items-center gap-1.5 text-sig-dim text-(length:--sig-text-md)">
            <span className="text-sig-danger animate-[pulse_1.5s_infinite]">
              ●
            </span>{" "}
            LIVE FEED
          </div>
          <Ticker items={tickerItems} onSelect={handleTickerSelect} />
        </div>
      )}
    </div>
  );
}
