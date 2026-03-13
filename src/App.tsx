import React, { useState, useMemo, useEffect } from "react";
import { GlobeVisualization } from "@/components/GlobeVisualization";
import { DetailPanel } from "@/components/DetailPanel";
import { Ticker } from "@/components/Ticker";
import { AircraftFilterControl } from "@/components/AircraftFilterControl";
import { useTheme } from "@/context/ThemeContext";
import { LAYER_TYPES } from "@/config/theme";
import {
  type DataPoint,
  type AircraftFilter,
  matchesAircraftFilter,
} from "@/lib/mockData";
import { useAircraftData } from "@/lib/useAircraftData";
import {
  getInitialAircraftFilter,
  syncAircraftFilterToUrl,
} from "@/lib/aircraftFilterUrl";
import "./index.css";

export function App() {
  const [layers, setLayers] = useState<Record<string, boolean>>({
    ships: true,
    events: true,
    quakes: true,
  });
  const [aircraftFilter, setAircraftFilter] = useState<AircraftFilter>(() =>
    getInitialAircraftFilter(),
  );

  const [flat, setFlat] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotationSpeed, setRotationSpeed] = useState(1);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [selected, setSelected] = useState<DataPoint | null>(null);
  const [time, setTime] = useState(new Date());
  const { theme, mode } = useTheme();
  const C = theme.colors;

  // Fetch real aircraft data
  const { data: allData, loading, error: aircraftError } = useAircraftData();

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const tickerItems = useMemo(
    () =>
      allData
        .filter(
          (d) =>
            d.type === "events" || d.type === "quakes" || Math.random() > 0.6,
        )
        .sort(() => Math.random() - 0.5)
        .slice(0, 24),
    [allData],
  );

  const counts = useMemo(
    () => ({
      ships: allData.filter((d) => d.type === "ships").length,
      aircraft: allData.filter(
        (d) =>
          d.type === "aircraft" && matchesAircraftFilter(d, aircraftFilter),
      ).length,
      events: allData.filter((d) => d.type === "events").length,
      quakes: allData.filter((d) => d.type === "quakes").length,
    }),
    [allData, aircraftFilter],
  );

  const activeCount =
    allData.filter((d) => d.type !== "aircraft" && layers[d.type]).length +
    allData.filter(
      (d) => d.type === "aircraft" && matchesAircraftFilter(d, aircraftFilter),
    ).length;

  const toggleLayer = (key: string) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  };

  const handleSelect = (item: DataPoint | null) => {
    // Empty globe/map clicks should be ignored; only point clicks select.
    if (!item) return;

    // While chrome is hidden, globe clicks should not toggle UI.
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

  // Keep aircraft filter shareable via URL params.
  useEffect(() => {
    syncAircraftFilterToUrl(aircraftFilter);
  }, [aircraftFilter]);

  // Derive countries sorted by count from live aircraft data
  const availableCountries = useMemo(() => {
    const counts = new Map<string, number>();
    allData.forEach((d) => {
      if (d.type === "aircraft") {
        const c = (d as any).data?.originCountry;
        if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
  }, [allData]);

  const colorMap: Record<string, string> = {
    ships: C.ships,
    aircraft: C.aircraft,
    events: C.events,
    quakes: C.quakes,
  };

  return (
    <div
      className="w-screen h-screen flex flex-col overflow-hidden"
      style={{
        background: C.bg,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {/* ── HEADER ── */}
      {!chromeHidden && (
        <div
          className="flex justify-between items-center px-4 py-2 shrink-0 z-20"
          style={{
            borderBottom: `1px solid ${C.border}`,
            background: C.panel + "ee",
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
              style={{ color: C.bright, fontSize: "clamp(14px, 3vw, 24px)" }}
            >
              SIGINT
            </span>
            <span
              className="font-light"
              style={{ color: C.dim, fontSize: "clamp(10px, 1.8vw, 16px)" }}
            >
              OSINT LIVE FEED
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Layer toggles */}
            <div className="flex gap-1 items-center">
              {/* Non-aircraft layers */}
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
                      background: layers[key]
                        ? colorMap[key] + "15"
                        : "transparent",
                      border: `1px solid ${layers[key] ? colorMap[key] + "50" : C.border}`,
                      color: layers[key] ? colorMap[key] : C.dim,
                      fontFamily: "inherit",
                      fontSize: "clamp(10px, 1.5vw, 14px)",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: "clamp(12px, 1.8vw, 16px)" }}>
                      {cfg.icon}
                    </span>
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
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.accent,
                fontFamily: "inherit",
                fontSize: "clamp(10px, 1.5vw, 14px)",
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
                background: autoRotate ? C.accent + "18" : "transparent",
                border: `1px solid ${autoRotate ? C.accent + "70" : C.border}`,
                color: autoRotate ? C.accent : C.dim,
                fontFamily: "inherit",
                fontSize: "clamp(10px, 1.5vw, 14px)",
                cursor: "pointer",
              }}
            >
              {autoRotate ? "⏸ ROT" : "▶ ROT"}
            </button>

            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded"
              style={{ border: `1px solid ${C.border}` }}
            >
              <span
                style={{ color: C.dim, fontSize: "clamp(9px, 1.2vw, 12px)" }}
              >
                SPD
              </span>
              <input
                type="range"
                aria-label="Rotation speed"
                title="Rotation speed"
                min={0.2}
                max={3}
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
                style={{
                  color: C.accent,
                  fontSize: "clamp(11px, 1.5vw, 15px)",
                }}
              >
                {time.toLocaleTimeString("en-US", { hour12: false })}
              </div>
              <div
                className="tracking-wide"
                style={{ color: C.dim, fontSize: "clamp(9px, 1.2vw, 12px)" }}
              >
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
          selected={selected}
        />
        {!chromeHidden && (
          <DetailPanel item={selected} onClose={() => setSelected(null)} />
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
                      background: C.panel + "bb",
                      borderLeft: `2px solid ${colorMap[key]}`,
                    }}
                  >
                    <span
                      style={{
                        color: colorMap[key],
                        fontSize: "clamp(10px, 1.5vw, 14px)",
                      }}
                    >
                      {cfg.icon}
                    </span>
                    <span
                      className="tracking-wide"
                      style={{
                        color: C.dim,
                        fontSize: "clamp(9px, 1.3vw, 13px)",
                      }}
                    >
                      {cfg.label}
                    </span>
                    <span
                      className="font-bold"
                      style={{
                        color: colorMap[key],
                        fontSize: "clamp(10px, 1.5vw, 14px)",
                      }}
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
            style={{
              color: C.dim,
              background: C.panel + "99",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "clamp(9px, 1.3vw, 13px)",
            }}
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
            background: C.panel + "ee",
          }}
        >
          <div
            className="tracking-wider mb-0.5 flex items-center gap-1.5"
            style={{
              color: C.dim,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "clamp(9px, 1.3vw, 13px)",
            }}
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
