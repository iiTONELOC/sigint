import { useState, useEffect, useMemo, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";
import type { DataPoint } from "@/features/base/dataPoints";
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
    if (w < 1024) return 2;
    return 3;
  }, []);

  const [count, setCount] = useState(getCount);

  useEffect(() => {
    const onResize = () => setCount(getCount());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [getCount]);

  return count;
}

function relativeTime(timestamp?: string): string {
  if (!timestamp) return "LIVE";
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 0 || diff < 60_000) return "LIVE";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function Ticker({ items }: Readonly<TickerProps>) {
  const [idx, setIdx] = useState(0);
  const { theme } = useTheme();
  const C = theme.colors;
  const colorMap = useMemo(() => getColorMap(theme), [theme]);
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
            className="flex-1 min-w-0 rounded overflow-hidden px-2.5 py-1.5 bg-sig-panel/80 border border-sig-border h-22.5"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div className="flex justify-between mb-0.5">
              <span
                className="tracking-wider flex items-center gap-1 text-(length:--sig-text-md)"
                style={{ color }}
              >
                <Icon
                  size="1em"
                  {...(item.type === "aircraft" || item.type === "events"
                    ? { fill: "currentColor", strokeWidth: 0 }
                    : { strokeWidth: 2.5 })}
                />
                {feature.label}
              </span>
              <span className="text-sig-dim text-(length:--sig-text-sm)">
                {relativeTime(item.timestamp)}
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
