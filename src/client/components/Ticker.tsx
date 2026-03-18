import { useState, useEffect, useMemo, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useData } from "@/context/DataContext";

import type { DataPoint } from "@/features/base/dataPoints";
import { relativeAge } from "@/lib/timeFormat";
import { featureRegistry } from "@/features/registry";

type TickerProps = {
  readonly items: DataPoint[];
};

const TICKER_INTERVAL_MS = 6500;

function useVisibleCount(): number {
  const getCount = useCallback(() => {
    if (typeof window === "undefined") return 3;
    const w = window.innerWidth;
    if (w < 640) return 1;
    if (w < 768) return 2;
    if (w < 1024) return 3;
    if (w < 1440) return 4;
    if (w < 1920) return 5;
    return 6;
  }, []);

  const [count, setCount] = useState(getCount);

  useEffect(() => {
    const onResize = () => setCount(getCount());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [getCount]);

  return count;
}

function tickerSummary(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  const parts: string[] = [];
  // Primary label
  if (item.type === "aircraft") {
    parts.push(
      (d.callsign as string)?.trim() || (d.icao24 as string) || "Unknown",
    );
    if (d.acType && d.acType !== "Unknown") parts.push(d.acType as string);
    if (d.originCountry) parts.push(d.originCountry as string);
  } else if (item.type === "ships") {
    parts.push((d.name as string) || "Unknown vessel");
  } else if (item.type === "events") {
    parts.push((d.headline as string) || "Event");
  } else if (item.type === "quakes") {
    parts.push((d.location as string) || "Quake");
    if (d.magnitude != null) parts.push(`M${d.magnitude}`);
  } else if (item.type === "fires") {
    parts.push("Fire hotspot");
    if (d.frp != null) parts.push(`FRP ${d.frp} MW`);
  } else if (item.type === "weather") {
    parts.push((d.event as string) || "Weather alert");
  }
  // Coords
  parts.push(
    `${Math.abs(item.lat).toFixed(2)}°${item.lat >= 0 ? "N" : "S"}, ${Math.abs(item.lon).toFixed(2)}°${item.lon >= 0 ? "E" : "W"}`,
  );
  return parts.join(" · ");
}

export function Ticker({ items }: Readonly<TickerProps>) {
  const { selectedCurrent, selectAndZoom, colorMap } = useData();
  const selectedId = selectedCurrent?.id ?? null;
  const [idx, setIdx] = useState(0);
  const { theme } = useTheme();
  const C = theme.colors;
  const visibleCount = useVisibleCount();

  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setIdx((i) => i + 1), TICKER_INTERVAL_MS);
    return () => clearInterval(iv);
  }, []);

  const visible = useMemo(() => {
    if (items.length === 0) return [];
    return Array.from(
      { length: visibleCount },
      (_, i) => items[(idx + i) % items.length]!,
    );
  }, [items, idx, visibleCount]);

  return (
    <div className="flex gap-2 overflow-hidden">
      {visible.map((item, i) => {
        if (!item) return null;
        const feature = featureRegistry.get(item.type);
        if (!feature) return null;

        const Icon = feature.icon;
        const color = colorMap[item.type];
        const TickerContent = feature.TickerContent;

        return (
          <div
            key={`${item.id}-${idx}-${i}`}
            onClick={() => {
              selectAndZoom(item);
            }}
            title={tickerSummary(item)}
            className={`flex-1 min-w-0 rounded overflow-hidden px-2.5 py-1.5 border h-22.5 transition-all cursor-pointer ${
              selectedId && item.id === selectedId
                ? "bg-sig-accent/15 border-sig-accent/50"
                : "bg-sig-panel/80 border-sig-border hover:bg-sig-panel hover:border-sig-accent/30 hover:shadow-[0_0_8px_rgba(0,212,240,0.08)]"
            }`}
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div className="flex justify-between mb-0.5">
              <span
                className="tracking-wider flex items-center gap-1 text-(length:--sig-text-md)"
                style={{ color }}
              >
                <Icon size="1em" {...feature.iconProps} />
                {feature.label}
              </span>
              <span className="text-sig-dim text-(length:--sig-text-sm)">
                {relativeAge(item.timestamp)}
              </span>
            </div>

            <TickerContent
              data={(item as any).data ?? {}}
              textColor={C.text}
              dimColor={C.dim}
            />
          </div>
        );
      })}
    </div>
  );
}
