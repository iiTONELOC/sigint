import "../index.css";
import { useState, useMemo, useEffect, useRef } from "react";
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
import { GlobeVisualization } from "@/components/GlobeVisualization";
import { Header } from "@/components/Header";
import { DetailPanel } from "@/components/DetailPanel";
import { LayerLegend } from "@/components/LayerLegend";
import { StatusBadge } from "@/components/StatusBadge";
import { Ticker } from "@/components/Ticker";
import { mono, FONT_MD } from "@/components/styles";

export function App() {
  const { theme } = useTheme();
  const lastEnrichmentKeyRef = useRef("");
  const [flat, setFlat] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotationSpeed, setRotationSpeed] = useState(0.5);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [selected, setSelected] = useState<DataPoint | null>(null);
  const [layers, setLayers] = useState<Record<string, boolean>>({
    ships: true,
    events: true,
    quakes: true,
  });
  const [aircraftFilter, setAircraftFilter] = useState<AircraftFilter>(() =>
    getInitialAircraftFilter(),
  );

  const C = theme.colors;

  const {
    loading,
    data: allData,
    error: aircraftError,
    dataSource,
    requestAircraftEnrichment,
  } = useAircraftData();

  // ── Derived filter map for generic selectors ────────────────────────
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
    const tickerIcao24 = tickerItems
      .filter((item) => item.type === "aircraft")
      .map((item) => (item.data as any)?.icao24 ?? "")
      .filter(Boolean);

    const selectedIcao24 =
      selectedCurrent?.type === "aircraft"
        ? [(selectedCurrent.data as any)?.icao24 ?? ""]
        : [];

    const targets = Array.from(new Set([...tickerIcao24, ...selectedIcao24]));
    if (targets.length === 0) return;

    const key = [...targets].sort().join(",");
    if (!key || key === lastEnrichmentKeyRef.current) return;
    lastEnrichmentKeyRef.current = key;

    void requestAircraftEnrichment(targets);
  }, [tickerItems, selectedCurrent, requestAircraftEnrichment]);

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
      if (next) setSelected(null);
      return next;
    });
  };

  useEffect(() => {
    syncAircraftFilterToUrl(aircraftFilter);
  }, [aircraftFilter]);

  const availableCountries = useMemo(
    () => selectAvailableAircraftCountries(allData),
    [allData],
  );

  return (
    <div
      className="w-screen h-screen flex flex-col overflow-hidden"
      style={{ background: C.bg, fontFamily: "'JetBrains Mono', monospace" }}
    >
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
          selected={selectedCurrent}
        />
        {!chromeHidden && (
          <DetailPanel
            item={selectedCurrent}
            onClose={() => setSelected(null)}
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
        <div
          className="shrink-0 px-3 pt-1 pb-2"
          style={{
            borderTop: `1px solid ${C.border}`,
            background: `${C.panel}ee`,
          }}
        >
          <div
            className="tracking-wider mb-0.5 flex items-center gap-1.5"
            style={mono(C.dim, FONT_MD)}
          >
            <span style={{ color: C.danger, animation: "pulse 1.5s infinite" }}>
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
