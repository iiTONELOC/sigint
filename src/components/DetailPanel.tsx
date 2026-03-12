import React from "react";
import { useTheme } from "@/context/ThemeContext";
import { LAYER_TYPES } from "@/config/theme";
import { type DataPoint } from "@/lib/mockData";

interface DetailPanelProps {
  readonly item: DataPoint | null;
  readonly onClose: () => void;
}

export function DetailPanel({ item, onClose }: DetailPanelProps) {
  const { theme } = useTheme();
  const C = theme.colors;

  if (!item) return null;

  const layerCfg = LAYER_TYPES[item.type];
  const colorMap: Record<string, string> = {
    ships: C.ships,
    aircraft: C.aircraft,
    events: C.events,
    quakes: C.quakes,
  };
  const color = colorMap[item.type];

  const rowsByType: Record<string, [string, string][]> = {
    ships: [
      ["Vessel", item.name || ""],
      ["Type", item.vesselType || ""],
      ["Flag", item.flag || ""],
      ["Speed", `${item.speed} kn`],
      ["Heading", `${item.heading}\u00B0`],
    ],
    aircraft: [
      ["Callsign", item.callsign || ""],
      ["Type", item.acType || ""],
      ["Altitude", `FL${Math.round((item.altitude || 0) / 100)}`],
      ["Speed", `${item.speed} kn`],
      ["Heading", `${item.heading}\u00B0`],
    ],
    events: [
      ["Category", item.category || ""],
      ["Headline", item.headline || ""],
      ["Source", item.source || ""],
      [
        "Severity",
        "\u2588".repeat(item.severity || 0) +
          "\u2591".repeat(5 - (item.severity || 0)),
      ],
      [
        "Time",
        item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "",
      ],
    ],
    quakes: [
      ["Magnitude", `M${item.magnitude}`],
      ["Depth", `${item.depth} km`],
      ["Location", item.location || ""],
      [
        "Time",
        item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "",
      ],
    ],
  };
  const rows: [string, string][] = rowsByType[item.type] || [];

  return (
    <div
      className="absolute right-3.5 top-3.5 w-64 rounded-md backdrop-blur-sm z-30"
      style={{
        background: C.panel + "f0",
        border: `1px solid ${C.border}`,
        padding: 14,
      }}
    >
      <div className="flex justify-between items-center mb-2.5">
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: "clamp(14px, 2vw, 18px)" }}>
            {layerCfg.icon}
          </span>
          <span
            className="font-bold tracking-widest"
            style={{
              color,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "clamp(10px, 1.5vw, 14px)",
            }}
          >
            {layerCfg.label}
          </span>
        </div>
        <span
          onClick={onClose}
          className="cursor-pointer text-[15px] leading-none select-none"
          style={{ color: C.dim }}
        >
          ✕
        </span>
      </div>
      <div className="pt-2.5" style={{ borderTop: `1px solid ${C.border}` }}>
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between mb-1.5">
            <span
              className="uppercase tracking-wide"
              style={{
                color: C.dim,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "clamp(9px, 1.3vw, 12px)",
              }}
            >
              {k}
            </span>
            <span
              className="text-right max-w-[155px] break-words"
              style={{
                color: C.bright,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "clamp(10px, 1.4vw, 13px)",
              }}
            >
              {v}
            </span>
          </div>
        ))}
      </div>
      <div
        className="mt-1.5 pt-1.5"
        style={{
          borderTop: `1px solid ${C.border}`,
          color: C.dim,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "clamp(9px, 1.3vw, 11px)",
        }}
      >
        {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
        {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
      </div>
    </div>
  );
}
