import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useData } from "@/context/DataContext";
import { cacheGet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

import type { DataPoint } from "@/features/base/dataPoints";
import { relativeAge } from "@/lib/timeFormat";
import { featureRegistry } from "@/features/registry";

type TickerProps = {
  readonly items: DataPoint[];
};

// ── Config ──────────────────────────────────────────────────────────

const ITEM_WIDTH_DESKTOP = 280;
const ITEM_WIDTH_MOBILE = 220;
const GAP = 8;
const STOPPED_SWAP_MS = 8000; // when speed=0, swap visible set every 8s

// ── Speed setting (persisted to IndexedDB) ──────────────────────────
// 0 = stopped, 25 = slow, 50 = normal, 100 = fast

function useTickerSpeed(): number {
  const [speed, setSpeed] = useState(() => {
    const saved = cacheGet<number>(CACHE_KEYS.tickerSpeed);
    return typeof saved === "number" ? saved : 10;
  });

  // Poll for external changes (settings modal writes to cache)
  useEffect(() => {
    const iv = setInterval(() => {
      const saved = cacheGet<number>(CACHE_KEYS.tickerSpeed);
      if (typeof saved === "number" && saved !== speed) setSpeed(saved);
    }, 1000);
    return () => clearInterval(iv);
  }, [speed]);

  return speed;
}

// ── Summary text ────────────────────────────────────────────────────

function tickerSummary(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  const parts: string[] = [];
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
  parts.push(
    `${Math.abs(item.lat).toFixed(2)}°${item.lat >= 0 ? "N" : "S"}, ${Math.abs(item.lon).toFixed(2)}°${item.lon >= 0 ? "E" : "W"}`,
  );
  return parts.join(" · ");
}

// ── Age refresh ─────────────────────────────────────────────────────

function useAgeRefresh() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);
}

// ── Item width responsive ───────────────────────────────────────────

function useItemWidth(): number {
  const getW = useCallback(
    () =>
      typeof window !== "undefined" && window.innerWidth < 640
        ? ITEM_WIDTH_MOBILE
        : ITEM_WIDTH_DESKTOP,
    [],
  );
  const [w, setW] = useState(getW);
  useEffect(() => {
    const onResize = () => setW(getW());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [getW]);
  return w;
}

// ── Component ───────────────────────────────────────────────────────

export function Ticker({ items }: Readonly<TickerProps>) {
  const { selectedCurrent, selectAndZoom, colorMap } = useData();
  const selectedId = selectedCurrent?.id ?? null;
  const { theme } = useTheme();
  const C = theme.colors;
  const itemWidth = useItemWidth();
  const speed = useTickerSpeed();

  useAgeRefresh();

  const containerRef = useRef<HTMLDivElement>(null);
  const step = itemWidth + GAP;

  // How many items fill the screen + 2 buffer
  const bufferCount = useMemo(() => {
    if (typeof window === "undefined") return 8;
    return Math.ceil(window.innerWidth / step) + 2;
  }, [step]);

  // Stable ref to items — prevents spaz on data refresh
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Offset into the items array
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);

  // Scroll position — use ref for rAF, state for render
  const scrollXRef = useRef(0);
  const [scrollX, setScrollX] = useState(0);

  const pausedRef = useRef(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // ── Scrolling mode (speed > 0) ──────────────────────────────────
  useEffect(() => {
    if (items.length === 0) return;

    const tick = (now: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = now;
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      const currentSpeed = speedRef.current;

      if (!pausedRef.current && currentSpeed > 0) {
        scrollXRef.current += currentSpeed * dt;

        // Recycle when first item exits left
        if (scrollXRef.current >= step) {
          scrollXRef.current -= step;
          offsetRef.current += 1;
          setOffset(offsetRef.current);
        }

        setScrollX(scrollXRef.current);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [items.length, step]);

  // ── Stopped mode (speed === 0): swap visible set periodically ───
  useEffect(() => {
    if (speed !== 0 || items.length === 0) return;

    // Reset scroll position when stopping
    scrollXRef.current = 0;
    setScrollX(0);

    const iv = setInterval(() => {
      offsetRef.current += bufferCount;
      setOffset(offsetRef.current);
    }, STOPPED_SWAP_MS);
    return () => clearInterval(iv);
  }, [speed, items.length, bufferCount]);

  // Pause on hover
  const handleMouseEnter = useCallback(() => {
    pausedRef.current = true;
  }, []);
  const handleMouseLeave = useCallback(() => {
    pausedRef.current = false;
    lastTimeRef.current = 0;
  }, []);

  // Build visible items — uses itemsRef.current so data refreshes
  // don't cause a layout jump (offset stays stable)
  const visible = useMemo(() => {
    const pool = itemsRef.current;
    if (pool.length === 0) return [];
    return Array.from({ length: bufferCount }, (_, i) => {
      const idx = (((offset + i) % pool.length) + pool.length) % pool.length;
      return { item: pool[idx]!, slotKey: offset + i };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, bufferCount, items]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="flex"
        style={{
          transform: `translate3d(-${scrollX}px, 0, 0)`,
          gap: GAP,
          willChange: "transform",
        }}
      >
        {visible.map(({ item, slotKey }) => {
          const feature = featureRegistry.get(item.type);
          if (!feature) return null;

          const Icon = feature.icon;
          const color = colorMap[item.type];
          const TickerContent = feature.TickerContent;
          const isSelected = selectedId && item.id === selectedId;

          return (
            <div
              key={slotKey}
              onClick={() => selectAndZoom(item)}
              title={tickerSummary(item)}
              className={`shrink-0 rounded overflow-hidden border cursor-pointer ${
                isSelected
                  ? "bg-sig-accent/15 border-sig-accent/50"
                  : "bg-sig-panel/80 border-sig-border hover:bg-sig-panel hover:border-sig-accent/30 hover:shadow-[0_0_8px_rgba(0,212,240,0.08)]"
              }`}
              style={{
                width: itemWidth,
                borderLeft: `3px solid ${color}`,
              }}
            >
              {/* Compact single-line mode for small screens */}
              <div className="sm:hidden flex items-center gap-1.5 px-2 py-1 min-h-8">
                <Icon
                  size={11}
                  style={{ color }}
                  className="shrink-0"
                  {...feature.iconProps}
                />
                <span
                  className="text-(length:--sig-text-sm) font-semibold tracking-wider truncate"
                  style={{ color }}
                >
                  {tickerSummary(item).split(" · ").slice(0, 2).join(" · ")}
                </span>
                <span className="ml-auto text-sig-dim text-(length:--sig-text-xs) shrink-0">
                  {relativeAge(item.timestamp)}
                </span>
              </div>

              {/* Full card mode for larger screens */}
              <div className="hidden sm:block px-2.5 py-1.5 h-22.5">
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
