import React, { useState, useMemo, useEffect } from "react";
import { GlobeVisualization } from "@/components/GlobeVisualization";
import { DetailPanel } from "@/components/DetailPanel";
import { Ticker } from "@/components/Ticker";
import { useTheme } from "@/context/ThemeContext";
import { LAYER_TYPES } from "@/config/theme";
import { generateMockData, type DataPoint } from "@/lib/mockData";
import "./index.css";

export function App() {
  const [layers, setLayers] = useState<Record<string, boolean>>({
    ships: true,
    aircraft: true,
    events: true,
    quakes: true,
  });
  const [flat, setFlat] = useState(false);
  const [selected, setSelected] = useState<DataPoint | null>(null);
  const [time, setTime] = useState(new Date());
  const { theme } = useTheme();
  const C = theme.colors;

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const allData = useMemo(() => generateMockData(), []);

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
      aircraft: allData.filter((d) => d.type === "aircraft").length,
      events: allData.filter((d) => d.type === "events").length,
      quakes: allData.filter((d) => d.type === "quakes").length,
    }),
    [allData],
  );

  const activeCount = allData.filter((d) => layers[d.type]).length;

  const toggleLayer = (key: string) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  };

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
          <div className="flex gap-1">
            {(
              Object.entries(LAYER_TYPES) as [
                string,
                { label: string; icon: string },
              ][]
            ).map(([key, cfg]) => (
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
                }}
              >
                <span style={{ fontSize: "clamp(12px, 1.8vw, 16px)" }}>
                  {cfg.icon}
                </span>
                <span>{counts[key as keyof typeof counts]}</span>
              </button>
            ))}
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
            }}
          >
            {flat ? "\u25C9 GLOBE" : "\u25AD FLAT"}
          </button>

          {/* Clock */}
          <div className="text-right">
            <div
              className="font-semibold tracking-wider"
              style={{ color: C.accent, fontSize: "clamp(11px, 1.5vw, 15px)" }}
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

      {/* ── GLOBE / MAP ── */}
      <div className="flex-1 relative overflow-hidden">
        <GlobeVisualization
          data={allData}
          layers={layers}
          flat={flat}
          onSelect={setSelected}
          selected={selected}
        />
        <DetailPanel item={selected} onClose={() => setSelected(null)} />

        {/* Layer legend */}
        <div className="absolute left-3 bottom-3 flex flex-col gap-1 z-10">
          {(
            Object.entries(LAYER_TYPES) as [
              string,
              { label: string; icon: string },
            ][]
          ).map(
            ([key, cfg]) =>
              layers[key] && (
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

        {/* Status badge */}
        <div
          className="absolute right-3 bottom-3 z-10 text-right rounded px-2 py-1"
          style={{
            color: C.dim,
            background: C.panel + "99",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "clamp(9px, 1.3vw, 13px)",
          }}
        >
          <div>PROTOTYPE — SIMULATED DATA</div>
          <div className="mt-px" style={{ color: C.accent }}>
            {activeCount} ACTIVE TRACKS
          </div>
        </div>
      </div>

      {/* ── TICKER ── */}
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
    </div>
  );
}

export default App;
