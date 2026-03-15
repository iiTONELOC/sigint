import "../index.css";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";
import type { DataPoint } from "@/features/base/dataPoints";
import type { AircraftFilter } from "@/features/aircraft/types";
import {
  useAircraftData,
  getInitialAircraftFilter,
  syncAircraftFilterToUrl,
} from "@/features/aircraft";
import {
  selectActiveCount,
  selectLayerCounts,
  selectAvailableAircraftCountries,
} from "@/lib/uiSelectors";
import { buildTickerItems } from "@/lib/tickerFeed";
import { GlobeVisualization } from "@/components/globe";
import { Header } from "@/components/Header";
import { Search } from "@/components/Search";
import { DetailPanel } from "@/components/DetailPanel";
import { LayerLegend } from "@/components/LayerLegend";
import { StatusBadge } from "@/components/StatusBadge";
import { Ticker } from "@/components/Ticker";

export function App() {
  const { theme } = useTheme();
  const lastEnrichmentKeyRef = useRef("");
  const [flat, setFlat] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotationSpeed, setRotationSpeed] = useState(0.2);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [selected, setSelected] = useState<DataPoint | null>(null);
  const [isolateMode, setIsolateMode] = useState<null | "solo" | "focus">(null);
  const [layers, setLayers] = useState<Record<string, boolean>>({
    ships: true,
    events: true,
    quakes: true,
  });
  const [aircraftFilter, setAircraftFilter] = useState<AircraftFilter>(() =>
    getInitialAircraftFilter(),
  );
  const [zoomToId, setZoomToId] = useState<string | null>(null);
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string> | null>(
    null,
  );
  const stashedSelectionRef = useRef<DataPoint | null>(null);
  const stashedIsolateModeRef = useRef<null | "solo" | "focus">(null);
  const [panelSide, setPanelSide] = useState<"left" | "right">("right");

  const {
    loading,
    data: allData,
    error: aircraftError,
    dataSource,
    requestAircraftEnrichment,
  } = useAircraftData();

  const filters = useMemo<Record<string, unknown>>(
    () => ({
      aircraft: aircraftFilter,
      ships: layers.ships ?? true,
      events: layers.events ?? true,
      quakes: layers.quakes ?? true,
    }),
    [aircraftFilter, layers],
  );

  const tickerItems = useMemo(
    () => buildTickerItems(allData, filters, layers),
    [allData, filters, layers],
  );

  const selectedCurrent = useMemo(() => {
    if (!selected) return null;
    const next = allData.find((item) => item.id === selected.id);
    return next ?? selected;
  }, [allData, selected]);

  // ── Aircraft enrichment ─────────────────────────────────────────────
  useEffect(() => {
    if (selectedCurrent?.type !== "aircraft") return;

    const icao24 = (selectedCurrent.data as any)?.icao24;
    if (!icao24) return;

    const key = icao24;
    if (key === lastEnrichmentKeyRef.current) return;
    lastEnrichmentKeyRef.current = key;

    void requestAircraftEnrichment([icao24]);
  }, [selectedCurrent, requestAircraftEnrichment]);

  const counts = useMemo(
    () => selectLayerCounts(allData, filters),
    [allData, filters],
  );

  const activeCount = useMemo(
    () => selectActiveCount(allData, filters),
    [allData, filters],
  );

  const toggleLayer = (key: string) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  };

  const handleSelect = (item: DataPoint | null) => {
    if (!item) return;
    if (chromeHidden) return;
    setSelected(item);
  };

  const handleRawCanvasClick = () => {
    setChromeHidden((v) => {
      const next = !v;
      if (next) {
        setSelected(null);
        setIsolateMode(null);
      }
      return next;
    });
  };

  const handleSearchSelect = (item: DataPoint) => {
    setSelected(item);
  };

  const handleSearchZoomTo = (item: DataPoint) => {
    setZoomToId(item.id);
    setTimeout(() => setZoomToId(null), 100);
  };

  const handleSearchMatchIds = useCallback(
    (ids: Set<string> | null) => {
      setSearchMatchIds(ids);
      if (ids) {
        setSelected((prev) => {
          if (prev && !ids.has(prev.id)) {
            stashedSelectionRef.current = prev;
            stashedIsolateModeRef.current = isolateMode;
            setIsolateMode(null);
            return null;
          }
          return prev;
        });
      } else {
        if (stashedSelectionRef.current) {
          setSelected(stashedSelectionRef.current);
          setIsolateMode(stashedIsolateModeRef.current);
          stashedSelectionRef.current = null;
          stashedIsolateModeRef.current = null;
        }
      }
    },
    [isolateMode],
  );

  useEffect(() => {
    syncAircraftFilterToUrl(aircraftFilter);
  }, [aircraftFilter]);

  const availableCountries = useMemo(
    () => selectAvailableAircraftCountries(allData),
    [allData],
  );

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden min-w-[320px] bg-sig-bg font-mono">
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

      {/* ── GLOBE / MAP ── */}
      <div className="flex-1 relative overflow-hidden">
        <GlobeVisualization
          data={allData}
          layers={layers}
          aircraftFilter={aircraftFilter}
          flat={flat}
          autoRotate={autoRotate}
          rotationSpeed={rotationSpeed}
          onSelect={handleSelect}
          onRawCanvasClick={handleRawCanvasClick}
          onMiddleClick={() => setAutoRotate((v) => !v)}
          selected={selectedCurrent}
          isolatedId={isolateMode ? (selectedCurrent?.id ?? null) : null}
          isolateMode={isolateMode}
          zoomToId={zoomToId}
          searchMatchIds={searchMatchIds}
          onSelectedSide={setPanelSide}
        />
        {!chromeHidden && (
          <DetailPanel
            item={selectedCurrent}
            onClose={() => {
              setSelected(null);
              setIsolateMode(null);
            }}
            isolateMode={isolateMode}
            onSetIsolateMode={setIsolateMode}
            side={panelSide}
          />
        )}

        {!chromeHidden && <LayerLegend layers={layers} counts={counts} />}

        {!chromeHidden && (
          <StatusBadge
            loading={loading}
            dataSource={dataSource}
            activeCount={activeCount}
          />
        )}
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
          <Ticker items={tickerItems} />
        </div>
      )}
    </div>
  );
}

export default App;
