import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useData } from "@/context/DataContext";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  Filter,
  ExternalLink,
  Locate,
  Zap,
  Activity,
  Flame,
  CloudAlert,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type FeedFilter = "all" | "events" | "quakes" | "fires" | "weather";

// ── Constants ───────────────────────────────────────────────────────

const ROW_HEIGHT = 68;
const OVERSCAN = 6;

// ── Severity badge ──────────────────────────────────────────────────

const SEVERITY_LABELS: Record<number, string> = {
  1: "MON",
  2: "CON",
  3: "TEN",
  4: "CON",
  5: "CRI",
};

const SEVERITY_COLORS: Record<number, string> = {
  1: "text-sig-dim bg-sig-dim/10 border-sig-dim/30",
  2: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  3: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  4: "text-red-400 bg-red-400/10 border-red-400/30",
  5: "text-red-500 bg-red-500/15 border-red-500/40",
};

function SeverityBadge({ severity }: { readonly severity: number }) {
  const label = SEVERITY_LABELS[severity] ?? "UNK";
  const cls = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS[1]!;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[length:var(--sig-text-sm)] font-semibold tracking-wider border ${cls}`}
    >
      {label}
    </span>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function relativeAge(timestamp?: string): string {
  if (!timestamp) return "";
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 60_000) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function getItemHeadline(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case "events":
      return (d.headline as string) || "Unknown event";
    case "quakes":
      return (d.location as string) || "Unknown location";
    case "fires":
      return `Fire hotspot${d.frp ? ` — FRP ${(d.frp as number).toFixed(1)} MW` : ""}`;
    case "weather":
      return (d.event as string) || (d.headline as string) || "Weather Alert";
    default:
      return item.id;
  }
}

function getItemSource(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case "events":
      return (d.source as string) || (d.sourceDomain as string) || "";
    case "quakes":
      return "USGS";
    case "fires":
      return (d.satellite as string) || "VIIRS";
    case "weather":
      return (d.senderName as string) || "NWS";
    default:
      return "";
  }
}

function getItemSeverity(item: DataPoint): number {
  const d = item.data as Record<string, unknown>;
  if (item.type === "events") return (d.severity as number) ?? 1;
  if (item.type === "quakes") {
    const mag = (d.magnitude as number) ?? 0;
    if (mag >= 6) return 5;
    if (mag >= 5) return 4;
    if (mag >= 4) return 3;
    if (mag >= 3) return 2;
    return 1;
  }
  if (item.type === "fires") {
    const frp = (d.frp as number) ?? 0;
    if (frp >= 100) return 5;
    if (frp >= 50) return 4;
    if (frp >= 20) return 3;
    if (frp >= 5) return 2;
    return 1;
  }
  if (item.type === "weather") {
    const sev: Record<string, number> = { Extreme: 5, Severe: 4, Moderate: 3, Minor: 2 };
    return sev[(d.severity as string) ?? ""] ?? 1;
  }
  return 1;
}

function getItemUrl(item: DataPoint): string | null {
  const d = item.data as Record<string, unknown>;
  if (item.type === "events") return (d.url as string) || null;
  if (item.type === "quakes") return (d.url as string) || null;
  return null;
}

function getItemCategory(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  if (item.type === "events") return (d.category as string) || "";
  if (item.type === "quakes") {
    const mag = (d.magnitude as number) ?? 0;
    return `M${mag.toFixed(1)}`;
  }
  if (item.type === "fires") return (d.confidence as string)?.toUpperCase() || "";
  if (item.type === "weather") return (d.severity as string) || "";
  return "";
}

function getItemLocation(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  if (item.type === "events") return (d.locationName as string) || "";
  if (item.type === "weather") return (d.areaDesc as string)?.split(";")[0]?.trim() || "";
  return "";
}

const ICON_MAP: Record<string, typeof Zap> = {
  events: Zap,
  quakes: Activity,
  fires: Flame,
  weather: CloudAlert,
};

// ── Component ───────────────────────────────────────────────────────

export function IntelFeedPane() {
  const { allData, filters, selectedCurrent, setSelected, setZoomToId } =
    useData();
  const { theme } = useTheme();
  const colorMap = useMemo(() => getColorMap(theme), [theme]);

  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");

  // ── Virtual scroll state ────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) setViewportH(entry.contentRect.height);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  // ── Filter to intel types ───────────────────────────────────────

  const feedTypes = useMemo(() => new Set(["events", "quakes", "fires", "weather"]), []);

  const feedItems = useMemo(() => {
    let items = allData.filter((item) => feedTypes.has(item.type));
    if (feedFilter !== "all") {
      items = items.filter((item) => item.type === feedFilter);
    }
    items.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
    return items;
  }, [allData, feedFilter, feedTypes]);

  // ── Type counts ─────────────────────────────────────────────────

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { events: 0, quakes: 0, fires: 0, weather: 0 };
    for (const item of allData) {
      if (feedTypes.has(item.type)) {
        counts[item.type] = (counts[item.type] ?? 0) + 1;
      }
    }
    return counts;
  }, [allData, feedTypes]);

  // ── Virtual window ──────────────────────────────────────────────

  const totalHeight = feedItems.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(
    feedItems.length,
    Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN,
  );
  const offsetY = startIdx * ROW_HEIGHT;
  const visibleItems = useMemo(
    () => feedItems.slice(startIdx, endIdx),
    [feedItems, startIdx, endIdx],
  );

  // ── Handlers ────────────────────────────────────────────────────

  const handleItemClick = useCallback(
    (item: DataPoint) => setSelected(item),
    [setSelected],
  );

  const handleZoomTo = useCallback(
    (item: DataPoint, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelected(item);
      setZoomToId(item.id);
      setTimeout(() => setZoomToId(null), 100);
    },
    [setSelected, setZoomToId],
  );

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col bg-sig-bg overflow-hidden">
      {/* Filter bar */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-sig-border/40">
        <Filter size={11} strokeWidth={2.5} className="text-sig-dim shrink-0" />
        <button
          onClick={() => setFeedFilter("all")}
          className={`px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors border ${
            feedFilter === "all"
              ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
              : "text-sig-dim bg-transparent border-sig-border/50"
          }`}
        >
          ALL ({feedItems.length})
        </button>
        {(["events", "quakes", "fires", "weather"] as const).map((type) => {
          const Icon = ICON_MAP[type] ?? Zap;
          const color = colorMap[type];
          const active = feedFilter === type;
          return (
            <button
              key={type}
              onClick={() => setFeedFilter(active ? "all" : type)}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors border ${
                active
                  ? "bg-sig-accent/10 border-sig-accent/30"
                  : "text-sig-dim bg-transparent border-sig-border/50"
              }`}
              style={{ color: active ? color : undefined }}
            >
              <Icon size={11} strokeWidth={2.5} />
              <span>{typeCounts[type] ?? 0}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        <span className="text-sig-dim text-(length:--sig-text-sm)">
          {feedItems.length} items
        </span>
      </div>

      {/* Virtual scrolling feed */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto sigint-scroll"
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}>
            {visibleItems.map((item) => {
              const Icon = ICON_MAP[item.type] ?? Zap;
              const color = colorMap[item.type] ?? theme.colors.dim;
              const isSelected = selectedCurrent?.id === item.id;
              const severity = getItemSeverity(item);
              const headline = getItemHeadline(item);
              const source = getItemSource(item);
              const category = getItemCategory(item);
              const location = getItemLocation(item);
              const url = getItemUrl(item);
              const age = relativeAge(item.timestamp);

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`px-3 py-1.5 border-b border-sig-border/20 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-sig-accent/10"
                      : "bg-transparent hover:bg-sig-panel/40"
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Row 1 */}
                  <div className="flex items-center gap-2">
                    <Icon
                      size={12}
                      strokeWidth={2.5}
                      style={{ color }}
                      className="shrink-0"
                    />
                    <SeverityBadge severity={severity} />
                    {category && (
                      <span
                        className="text-(length:--sig-text-sm) font-semibold tracking-wider truncate"
                        style={{ color }}
                      >
                        {category}
                      </span>
                    )}
                    <span className="ml-auto text-(length:--sig-text-sm) text-sig-dim shrink-0">
                      {age}
                    </span>
                  </div>
                  {/* Row 2 */}
                  <div className="text-sig-text text-(length:--sig-text-md) mt-0.5 truncate ml-5">
                    {headline}
                  </div>
                  {/* Row 3 */}
                  <div className="flex items-center gap-2 mt-0.5 ml-5">
                    {source && (
                      <span className="text-(length:--sig-text-sm) text-sig-dim truncate">
                        {source}
                      </span>
                    )}
                    {location && (
                      <span className="text-(length:--sig-text-sm) text-sig-dim truncate">
                        · {location}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-0.5 rounded text-sig-dim hover:text-sig-accent transition-colors"
                          title="Open source"
                        >
                          <ExternalLink size={11} strokeWidth={2.5} />
                        </a>
                      )}
                      <button
                        onClick={(e) => handleZoomTo(item, e)}
                        className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
                        title="Zoom to"
                      >
                        <Locate size={11} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {feedItems.length === 0 && (
          <div className="flex items-center justify-center h-full text-sig-dim text-(length:--sig-text-md)">
            No intel data available
          </div>
        )}
      </div>
    </div>
  );
}
