import "./index.css";
import {
  selectActiveCount,
  selectLayerCounts,
  selectAvailableAircraftCountries,
} from "@/lib/uiSelectors";
import {
  getInitialAircraftFilter,
  syncAircraftFilterToUrl,
} from "@/lib/aircraft/aircraftFilterUrl";
import { Ticker } from "@/components/Ticker";
import { LAYER_TYPES } from "@/config/theme";
import { useTheme } from "@/context/ThemeContext";
import { buildTickerItems } from "@/lib/tickerFeed";
import { DetailPanel } from "@/components/DetailPanel";
import { useState, useMemo, useEffect, useRef } from "react";
import type { DataPoint } from "@/domain/providers/base/types";
import { useAircraftData } from "@/lib/aircraft/useAircraftData";
import { GlobeVisualization } from "@/components/GlobeVisualization";
import { AircraftFilterControl } from "@/components/AircraftFilterControl";
import {
  mono,
  FONT_SM,
  FONT_MD,
  FONT_BTN,
  FONT_ICON,
  FONT_TITLE,
  FONT_SUBTITLE,
  FONT_CLOCK,
} from "@/components/styles";
import type { AircraftFilter } from "./domain/providers/aircraft/aircraftTypes";

export function App() {
  const { theme, mode } = useTheme();
  const lastEnrichmentKeyRef = useRef("");
  const [flat, setFlat] = useState(false);
  const [time, setTime] = useState(new Date());
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
    requestAircraftEnrichment,
  } = useAircraftData();

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const tickerItems = useMemo(
    () => buildTickerItems(allData, aircraftFilter, layers),
    [allData, aircraftFilter, layers],
  );

  const selectedCurrent = useMemo(() => {
    if (!selected) return null;
    const next = allData.find((item) => item.id === selected.id);
    return next ?? selected;
  }, [allData, selected]);

  useEffect(() => {
    const tickerIcao24 = tickerItems
      .filter((item) => item.type === "aircraft")
      .map((item) => item.data?.icao24 ?? "")
      .filter(Boolean);

    const selectedIcao24 =
      selectedCurrent?.type === "aircraft"
        ? [selectedCurrent.data?.icao24 ?? ""]
        : [];

    const targets = Array.from(new Set([...tickerIcao24, ...selectedIcao24]));
    if (targets.length === 0) return;

    const key = [...targets].sort().join(",");
    if (!key || key === lastEnrichmentKeyRef.current) return;
    lastEnrichmentKeyRef.current = key;

    void requestAircraftEnrichment(targets);
  }, [tickerItems, selectedCurrent, requestAircraftEnrichment]);

  const counts = useMemo(
    () => selectLayerCounts(allData, aircraftFilter),
    [allData, aircraftFilter],
  );

  const activeCount = useMemo(
    () => selectActiveCount(allData, layers, aircraftFilter),
    [allData, layers, aircraftFilter],
  );

  const colorMap: Record<string, string> = {
    ships: C.ships,
    aircraft: C.aircraft,
    events: C.events,
    quakes: C.quakes,
  };

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
        <div
          className="flex justify-between items-center px-4 py-2 shrink-0 z-20"
          style={{
            borderBottom: `1px solid ${C.border}`,
            background: `${C.panel}ee`,
            minHeight: 44,
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-[7px] h-[7px] rounded-full"
              style={{
                background: C.accent,
                boxShadow: `0 0 8px ${C.accent}`,
                animation: "pulse 2s infinite",
              }}
            />
            <span
              className="font-bold tracking-[2.5px]"
              style={mono(C.bright, FONT_TITLE)}
            >
              SIGINT
            </span>
            <span className="font-light" style={mono(C.dim, FONT_SUBTITLE)}>
              OSINT LIVE FEED
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Layer toggles */}
            <div className="flex gap-1 items-center">
              {(
                Object.entries(LAYER_TYPES) as [
                  string,
                  { label: string; icon: string },
                ][]
              )
                .filter(([key]) => key !== "aircraft")
                .map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => toggleLayer(key)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded tracking-wide transition-all font-semibold"
                    style={{
                      ...mono(
                        layers[key] ? (colorMap[key] ?? C.dim) : C.dim,
                        FONT_BTN,
                      ),
                      background: layers[key]
                        ? `${colorMap[key]}15`
                        : "transparent",
                      border: `1px solid ${layers[key] ? `${colorMap[key]}50` : C.border}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: FONT_ICON }}>{cfg.icon}</span>
                    <span>{counts[key as keyof typeof counts]}</span>
                  </button>
                ))}

              <AircraftFilterControl
                aircraftFilter={aircraftFilter}
                setAircraftFilter={setAircraftFilter}
                aircraftCount={counts.aircraft}
                aircraftColor={colorMap.aircraft ?? C.aircraft}
                availableCountries={availableCountries}
                colors={{
                  panel: C.panel,
                  border: C.border,
                  bright: mode === "dark" ? "#00b8d4" : C.accent,
                  dim: C.dim,
                  danger: C.danger,
                }}
              />
            </div>

            {/* View toggle */}
            <button
              onClick={() => setFlat(!flat)}
              className="px-2.5 py-0.5 rounded tracking-wider font-semibold"
              style={{
                ...mono(C.accent, FONT_BTN),
                background: "transparent",
                border: `1px solid ${C.border}`,
                cursor: "pointer",
              }}
            >
              {flat ? "\u25C9 GLOBE" : "\u25AD FLAT"}
            </button>

            {/* Rotation controls */}
            <button
              onClick={() => setAutoRotate((v) => !v)}
              className="px-2.5 py-0.5 rounded tracking-wider font-semibold"
              style={{
                ...mono(autoRotate ? C.accent : C.dim, FONT_BTN),
                background: autoRotate ? `${C.accent}18` : "transparent",
                border: `1px solid ${autoRotate ? `${C.accent}70` : C.border}`,
                cursor: "pointer",
              }}
            >
              {autoRotate ? "⏸ ROT" : "▶ ROT"}
            </button>

            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded"
              style={{ border: `1px solid ${C.border}` }}
            >
              <span style={mono(C.dim, FONT_SM)}>SPD</span>
              <input
                type="range"
                aria-label="Rotation speed"
                title="Rotation speed"
                min={0.1}
                max={2}
                step={0.1}
                value={rotationSpeed}
                onChange={(e) => setRotationSpeed(Number(e.target.value))}
                style={{ width: 80, cursor: "pointer", accentColor: C.accent }}
              />
            </div>

            {/* Clock */}
            <div className="text-right">
              <div
                className="font-semibold tracking-wider"
                style={mono(C.accent, FONT_CLOCK)}
              >
                {time.toLocaleTimeString("en-US", { hour12: false })}
              </div>
              <div className="tracking-wide" style={mono(C.dim, FONT_SM)}>
                {time.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>
          </div>
        </div>
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

        {/* Layer legend */}
        {!chromeHidden && (
          <div className="absolute left-3 bottom-3 flex flex-col gap-1 z-10">
            {(
              Object.entries(LAYER_TYPES) as [
                string,
                { label: string; icon: string },
              ][]
            ).map(
              ([key, cfg]) =>
                layers[key] !== false && (
                  <div
                    key={key}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded"
                    style={{
                      background: `${C.panel}bb`,
                      borderLeft: `2px solid ${colorMap[key]}`,
                    }}
                  >
                    <span style={mono(colorMap[key] ?? C.dim, FONT_BTN)}>
                      {cfg.icon}
                    </span>
                    <span
                      className="tracking-wide"
                      style={mono(C.dim, FONT_MD)}
                    >
                      {cfg.label}
                    </span>
                    <span
                      className="font-bold"
                      style={mono(colorMap[key] ?? C.dim, FONT_BTN)}
                    >
                      {counts[key as keyof typeof counts]}
                    </span>
                  </div>
                ),
            )}
          </div>
        )}

        {/* Status badge */}
        {!chromeHidden && (
          <div
            className="absolute right-3 bottom-3 z-10 text-right rounded px-2 py-1"
            style={{ ...mono(C.dim, FONT_MD), background: `${C.panel}99` }}
          >
            <div>
              {loading
                ? "🔄 UPDATING AIRCRAFT..."
                : aircraftError
                  ? "⚠ LIVE DATA • FALLBACK"
                  : "🛰 LIVE DATA • AIRCRAFT ONLY"}
            </div>
            <div className="mt-px" style={{ color: C.accent }}>
              {activeCount} ACTIVE TRACKS
            </div>
            <div className="mt-px" style={{ color: C.dim }}>
              SIMULATED: SHIPS / EVENTS / QUAKES
            </div>
          </div>
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
