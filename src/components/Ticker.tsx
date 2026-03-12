import React, { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { LAYER_TYPES } from "@/config/theme";
import { type DataPoint } from "@/lib/mockData";

interface TickerProps {
  readonly items: DataPoint[];
}

export function Ticker({ items }: Readonly<TickerProps>) {
  const [idx, setIdx] = useState(0);
  const { theme } = useTheme();
  const C = theme.colors;

  useEffect(() => {
    const iv = setInterval(() => setIdx((i) => i + 1), 3500);
    return () => clearInterval(iv);
  }, []);

  const visible: DataPoint[] = [];
  if (items.length > 0) {
    for (let i = 0; i < 3; i++) {
      const item = items[(idx + i) % items.length];
      if (item) visible.push(item);
    }
  }

  const colorMap: Record<string, string> = {
    ships: C.ships,
    aircraft: C.aircraft,
    events: C.events,
    quakes: C.quakes,
  };

  return (
    <div className="flex gap-2 overflow-hidden">
      {visible.map((e, i) => {
        if (!e) return null;
        const layerCfg = LAYER_TYPES[e.type];
        const color = colorMap[e.type];
        return (
          <div
            key={`${e.id}-${idx}-${i}`}
            className="flex-1 min-w-0 rounded"
            style={{
              padding: "6px 10px",
              background: C.panel + "cc",
              border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${color}`,
            }}
          >
            <div className="flex justify-between mb-0.5">
              <span
                className="tracking-wider"
                style={{
                  color,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "clamp(9px, 1.3vw, 12px)",
                }}
              >
                {layerCfg.icon} {layerCfg.label}
              </span>
              <span
                style={{
                  color: C.dim,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "clamp(8px, 1.2vw, 11px)",
                }}
              >
                {e.timestamp
                  ? new Date(e.timestamp).toLocaleTimeString()
                  : "LIVE"}
              </span>
            </div>
            <div
              className="leading-snug overflow-hidden text-ellipsis whitespace-nowrap"
              style={{
                color: C.text,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "clamp(10px, 1.4vw, 13px)",
              }}
            >
              {e.type === "events" && e.headline}
              {e.type === "quakes" && `M${e.magnitude} \u2014 ${e.location}`}
              {e.type === "ships" && `${e.name} [${e.flag}] ${e.speed}kn`}
              {e.type === "aircraft" &&
                `${e.callsign} ${e.acType} FL${Math.round((e.altitude || 0) / 100)}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
