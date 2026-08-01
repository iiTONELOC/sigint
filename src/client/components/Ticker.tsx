import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useReducer,
  useRef,
} from "react";
import { Domain } from "@shared/domain/identity";
import { MS_PER_SECOND } from "@shared/time";
import { useTheme } from "@/theme";
import { useData } from "@/context/DataContext";
import { cacheGet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";
import { DomEvent } from "@/runtime";
import { formatLat, formatLon } from "@/geo";
import { useUnitsMode } from "@/preferences/units";
import { TickerSpeedPolicy } from "@/shell/ticker";

import type { DataPoint } from "@/features/base/dataPoints";
import { featureIconProps } from "@/features/base/presentation";
import { relativeAge } from "@/time";
import { featureRegistry } from "@/features/registry";
import {
  FireCopy,
  formatUnroundedFirePower,
} from "@/features/environmental/fires/formatters";
import { WeatherCopy } from "@/features/environmental/weather/formatters";

type TickerProps = {
  readonly items: DataPoint[];
  readonly compact?: boolean;
};

enum TickerPolicy {
  ItemWidthDesktopPx = 280,
  ItemWidthMobilePx = 220,
  GapPx = 8,
  StoppedSwapMs = 8000,
  SpeedPollMs = 1000,
  AgeRefreshMs = 30000,
  MobileMaxWidthPx = 640,
  FallbackViewportPx = 1200,
  CompactIconPx = 11,
}

enum TickerBuffer {
  FallbackCount = 8,
  SlackCount = 2,
}

enum TickerSummaryText {
  Event = "Event",
  Quake = "Quake",
  Separator = " · ",
  Unknown = "Unknown",
  UnknownVessel = "Unknown vessel",
}

enum TickerCoordinatePolicy {
  DecimalPlaces = 2,
}

enum TickerSummaryPolicy {
  CompactPartCount = 2,
}

// ── Speed setting (persisted to IndexedDB) ──────────────────────────

function useTickerSpeed(): number {
  const [speed, setSpeed] = useState<number>(TickerSpeedPolicy.Default);

  // Load from cache + poll for external changes
  useEffect(() => {
    let mounted = true;
    cacheGet<number>(CacheKey.TickerSpeed).then((saved) => {
      if (mounted && typeof saved === "number") setSpeed(saved);
    });
    const iv = setInterval(async () => {
      const saved = await cacheGet<number>(CacheKey.TickerSpeed);
      if (mounted && typeof saved === "number" && saved !== speed)
        setSpeed(saved);
    }, TickerPolicy.SpeedPollMs);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [speed]);

  return speed;
}

// ── Summary text ────────────────────────────────────────────────────

function summaryLead(item: DataPoint): string[] {
  switch (item.type) {
    case Domain.Aircraft: {
      const lead = [
        item.data.callsign?.trim() ||
          item.data.icao24 ||
          TickerSummaryText.Unknown,
      ];
      if (
        item.data.acType &&
        item.data.acType !== TickerSummaryText.Unknown
      ) {
        lead.push(item.data.acType);
      }
      if (item.data.originCountry) lead.push(item.data.originCountry);
      return lead;
    }
    case Domain.Ships:
      return [item.data.name || TickerSummaryText.UnknownVessel];
    case Domain.Events:
      return [item.data.headline || TickerSummaryText.Event];
    case Domain.Quakes: {
      const lead: string[] = [
        item.data.location || TickerSummaryText.Quake,
      ];
      if (item.data.magnitude != null) lead.push(`M${item.data.magnitude}`);
      return lead;
    }
    case Domain.Fires: {
      const lead: string[] = [FireCopy.Hotspot];
      if (item.data.frp != null) {
        lead.push(
          `${FireCopy.RadiativePower} ${formatUnroundedFirePower(item.data.frp)}`,
        );
      }
      return lead;
    }
    case Domain.Weather:
      return [item.data.event || WeatherCopy.TickerAlert];
    default:
      return [];
  }
}

function tickerSummary(item: DataPoint): string {
  return [
    ...summaryLead(item),
    `${formatLat(recordLatitude(item), TickerCoordinatePolicy.DecimalPlaces)}, ${formatLon(recordLongitude(item), TickerCoordinatePolicy.DecimalPlaces)}`,
  ].join(TickerSummaryText.Separator);
}

// ── Age refresh ─────────────────────────────────────────────────────

function useAgeRefresh() {
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    const iv = setInterval(refresh, TickerPolicy.AgeRefreshMs);
    return () => clearInterval(iv);
  }, []);
}

// ── Item width responsive ───────────────────────────────────────────

function useItemWidth(): number {
  const getW = useCallback(
    () =>
      typeof window !== "undefined" &&
      window.innerWidth < TickerPolicy.MobileMaxWidthPx
        ? TickerPolicy.ItemWidthMobilePx
        : TickerPolicy.ItemWidthDesktopPx,
    [],
  );
  const [w, setW] = useState<number>(getW);
  useEffect(() => {
    const onResize = () => setW(getW());
    window.addEventListener(DomEvent.Resize, onResize);
    return () => window.removeEventListener(DomEvent.Resize, onResize);
  }, [getW]);
  return w;
}

// ── Component ───────────────────────────────────────────────────────

export function Ticker({ items, compact = false }: Readonly<TickerProps>) {
  const { selectedCurrent, selectAndZoom, colorMap } = useData();
  const selectedId = selectedCurrent?.id ?? null;
  const { theme } = useTheme();
  const C = theme.colors;
  const baseItemWidth = useItemWidth();
  const itemWidth = compact ? TickerPolicy.ItemWidthMobilePx : baseItemWidth;
  const speed = useTickerSpeed();
  useUnitsMode(); // re-render ticker items when the units pref flips

  useAgeRefresh();

  const containerRef = useRef<HTMLDivElement>(null);
  const step = itemWidth + TickerPolicy.GapPx;

  // Track container width so bufferCount updates when viewport resizes
  const [containerWidth, setContainerWidth] = useState<number>(
    typeof window !== "undefined"
      ? window.innerWidth
      : TickerPolicy.FallbackViewportPx,
  );
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // How many items fill the container + slack
  const bufferCount = useMemo(() => {
    if (containerWidth <= 0) return TickerBuffer.FallbackCount;
    return Math.ceil(containerWidth / step) + TickerBuffer.SlackCount;
  }, [step, containerWidth]);

  // Stable ref to items, prevents a jump on data refresh
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Offset into the items array
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);

  // Scroll position: ref for rAF, state for render
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
      const dt = (now - lastTimeRef.current) / MS_PER_SECOND;
      lastTimeRef.current = now;

      const currentSpeed = speedRef.current;

      if (!pausedRef.current && currentSpeed > TickerSpeedPolicy.Stopped) {
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

  // ── Stopped mode: swap the visible set periodically ─────────────
  useEffect(() => {
    if (speed !== TickerSpeedPolicy.Stopped || items.length === 0) return;

    // Reset scroll position when stopping
    scrollXRef.current = 0;
    setScrollX(0);

    const iv = setInterval(() => {
      offsetRef.current += bufferCount;
      setOffset(offsetRef.current);
    }, TickerPolicy.StoppedSwapMs);
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

  // Build visible items from itemsRef.current so data refreshes
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
          gap: TickerPolicy.GapPx,
          willChange: "transform",
        }}
      >
        {visible.map(({ item, slotKey }) => {
          const feature = featureRegistry.get(item.type);
          if (!feature) return null;

          const Icon = feature.icon;
          const iconProps = featureIconProps(feature.iconStyle);
          const color = colorMap[item.type];
          const TickerContent = feature.TickerContent;
          const isSelected = selectedId && item.id === selectedId;

          return (
            <button
              type="button"
              key={slotKey}
              onClick={() => selectAndZoom(item)}
              title={tickerSummary(item)}
              className={`shrink-0 rounded overflow-hidden border cursor-pointer text-left ${
                isSelected
                  ? "bg-sig-accent/15 border-sig-accent/50"
                  : "bg-sig-panel/80 border-sig-border hover:bg-sig-panel hover:border-sig-accent/30 hover:shadow-[0_0_8px_rgba(0,212,240,0.08)]"
              }`}
              style={{
                width: itemWidth,
                borderLeft: `3px solid ${color}`,
              }}
            >
              {/* Compact single-line mode */}
              <div className={compact ? "flex items-center gap-1.5 px-2 py-1 min-h-8" : "md:hidden flex items-center gap-1.5 px-2 py-1 min-h-8"}>
                <Icon
                  size={TickerPolicy.CompactIconPx}
                  style={{ color }}
                  className="shrink-0"
                  {...iconProps}
                />
                <span
                  className="text-(length:--sig-text-sm) font-semibold tracking-wider truncate"
                  style={{ color }}
                >
                  {tickerSummary(item)
                    .split(TickerSummaryText.Separator)
                    .slice(0, TickerSummaryPolicy.CompactPartCount)
                    .join(TickerSummaryText.Separator)}
                </span>
                <span className="ml-auto text-sig-dim text-(length:--sig-text-xs) shrink-0">
                  {relativeAge(item.timestamp)}
                </span>
              </div>

              {/* Full card mode for desktop */}
              {!compact && (
              <div className="hidden md:block px-2.5 py-1.5 h-22.5">
                <div className="flex justify-between mb-0.5">
                  <span
                    className="tracking-wider flex items-center gap-1 text-(length:--sig-text-md)"
                    style={{ color }}
                  >
                    <Icon size="1em" {...iconProps} />
                    {feature.label}
                  </span>
                  <span className="text-sig-dim text-(length:--sig-text-sm)">
                    {relativeAge(item.timestamp)}
                  </span>
                </div>

                <TickerContent
                  data={item.data}
                  textColor={C.text}
                  dimColor={C.dim}
                />
              </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
