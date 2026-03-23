import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useData } from "@/context/DataContext";
import { useTheme } from "@/context/ThemeContext";
import { useVirtualScroll } from "@/hooks/useVirtualScroll";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  Filter,
  ExternalLink,
  Locate,
  Zap,
  Activity,
  Flame,
  CloudAlert,
  Newspaper,
  TrendingUp,
  Link2,
  Layers,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  List,
} from "lucide-react";
import { relativeAge } from "@/lib/timeFormat";

// ── Types ────────────────────────────────────────────────────────────

type ViewMode = "intel" | "raw";
type FeedFilter = "all" | "events" | "quakes" | "fires" | "weather";

// ── Constants ───────────────────────────────────────────────────────

const RAW_ROW_HEIGHT = 68;
const OVERSCAN = 6;

// ── Priority badge ──────────────────────────────────────────────────

function PriorityBadge({ priority }: { readonly priority: number }) {
  const cls =
    priority >= 8
      ? "text-red-400 bg-red-400/10 border-red-400/30"
      : priority >= 5
        ? "text-orange-400 bg-orange-400/10 border-orange-400/30"
        : "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider border shrink-0 ${cls}`}
    >
      P{priority}
    </span>
  );
}

// ── Severity badge (raw feed) ───────────────────────────────────────

const SEV_LABELS: Record<number, string> = {
  1: "MON",
  2: "CON",
  3: "TEN",
  4: "CON",
  5: "CRI",
};
const SEV_COLORS: Record<number, string> = {
  1: "text-sig-dim bg-sig-dim/10 border-sig-dim/30",
  2: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  3: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  4: "text-red-400 bg-red-400/10 border-red-400/30",
  5: "text-red-500 bg-red-500/15 border-red-500/40",
};

function SeverityBadge({ severity }: { readonly severity: number }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[length:var(--sig-text-sm)] font-semibold tracking-wider border shrink-0 ${SEV_COLORS[severity] ?? SEV_COLORS[1]!}`}
    >
      {SEV_LABELS[severity] ?? "UNK"}
    </span>
  );
}

// ── Product type icons ──────────────────────────────────────────────

const PRODUCT_ICONS: Record<string, typeof Zap> = {
  "cross-source": Link2,
  anomaly: AlertTriangle,
  cluster: Layers,
  trend: TrendingUp,
  "news-link": Newspaper,
};

const PRODUCT_LABELS: Record<string, string> = {
  "cross-source": "CORRELATION",
  anomaly: "ANOMALY",
  cluster: "CLUSTER",
  trend: "TREND",
  "news-link": "NEWS",
};

// ── Raw feed helpers ────────────────────────────────────────────────

const TYPE_ICONS: Record<string, typeof Zap> = {
  events: Zap,
  quakes: Activity,
  fires: Flame,
  weather: CloudAlert,
};

function rawHeadline(item: DataPoint): string {
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

function rawSource(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case "events":
      return (d.source as string) || "";
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

function rawSeverity(item: DataPoint): number {
  const d = item.data as Record<string, unknown>;
  if (item.type === "events") return (d.severity as number) ?? 1;
  if (item.type === "quakes") {
    const m = (d.magnitude as number) ?? 0;
    return m >= 6 ? 5 : m >= 5 ? 4 : m >= 4 ? 3 : m >= 3 ? 2 : 1;
  }
  if (item.type === "fires") {
    const f = (d.frp as number) ?? 0;
    return f >= 100 ? 5 : f >= 50 ? 4 : f >= 20 ? 3 : f >= 5 ? 2 : 1;
  }
  if (item.type === "weather") {
    const s: Record<string, number> = {
      Extreme: 5,
      Severe: 4,
      Moderate: 3,
      Minor: 2,
    };
    return s[(d.severity as string) ?? ""] ?? 1;
  }
  return 1;
}

function rawCategory(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  if (item.type === "events") return (d.category as string) || "";
  if (item.type === "quakes")
    return `M${((d.magnitude as number) ?? 0).toFixed(1)}`;
  if (item.type === "fires")
    return (d.confidence as string)?.toUpperCase() || "";
  if (item.type === "weather") return (d.severity as string) || "";
  return "";
}

function rawLocation(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  if (item.type === "events") return (d.locationName as string) || "";
  if (item.type === "weather")
    return (d.areaDesc as string)?.split(";")[0]?.trim() || "";
  return "";
}

function rawUrl(item: DataPoint): string | null {
  const d = item.data as Record<string, unknown>;
  if (item.type === "events" || item.type === "quakes")
    return (d.url as string) || null;
  return null;
}

// ── Component ───────────────────────────────────────────────────────

export function IntelFeedPane() {
  const {
    allData,
    newsArticles,
    selectedCurrent,
    setSelected,
    selectAndZoom,
    setRevealId,
    colorMap,
    correlation,
    watchActive,
    watchMode,
    watchProgress,
  } = useData();
  const { theme } = useTheme();

  const [viewMode, setViewMode] = useState<ViewMode>("intel");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Is watch targeting intel products?
  const isWatchingIntel =
    watchActive && (watchMode.source === "intel" || watchMode.source === "all");

  // Only highlight/scroll when the current watch item is from intel
  const isIntelActive =
    isWatchingIntel && watchMode.currentItemSource === "intel";

  // Find which product is the current watch target
  const watchTargetProductId = useMemo(() => {
    if (!isIntelActive || !watchMode.currentId) return null;
    const product = correlation.products.find((p) =>
      p.sources.some((s) => s.id === watchMode.currentId),
    );
    return product?.id ?? null;
  }, [isIntelActive, watchMode.currentId, correlation.products]);

  // Auto-scroll to watch target product (only when source is intel)
  const watchTargetRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (watchTargetRef.current && isIntelActive) {
      watchTargetRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [watchTargetProductId, isIntelActive]);

  // ── Raw feed (for raw view) ─────────────────────────────────────

  const feedTypes = useMemo(
    () => new Set(["events", "quakes", "fires", "weather"]),
    [],
  );

  const rawItems = useMemo(() => {
    let items = allData.filter((i) => feedTypes.has(i.type));
    if (feedFilter !== "all")
      items = items.filter((i) => i.type === feedFilter);
    items.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
    return items;
  }, [allData, feedFilter, feedTypes]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {
      events: 0,
      quakes: 0,
      fires: 0,
      weather: 0,
    };
    for (const item of allData) {
      if (feedTypes.has(item.type)) c[item.type] = (c[item.type] ?? 0) + 1;
    }
    return c;
  }, [allData, feedTypes]);

  // ── Virtual scroll (raw mode) ───────────────────────────────────

  const { scrollRef, totalHeight, offsetY, startIdx, endIdx, onScroll } =
    useVirtualScroll({
      itemCount: rawItems.length,
      rowHeight: RAW_ROW_HEIGHT,
      overscan: OVERSCAN,
    });

  const visibleRaw = useMemo(
    () => rawItems.slice(startIdx, endIdx),
    [rawItems, startIdx, endIdx],
  );

  // ── Handlers ────────────────────────────────────────────────────

  const handleItemClick = useCallback(
    (item: DataPoint) => {
      setSelected(item);
      setRevealId(item.id);
      setTimeout(() => setRevealId(null), 200);
    },
    [setSelected, setRevealId],
  );

  const handleZoomTo = useCallback(
    (item: DataPoint, e: React.MouseEvent) => {
      e.stopPropagation();
      selectAndZoom(item);
    },
    [selectAndZoom],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col bg-sig-bg overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-sig-border/40 flex-wrap">
        {/* View mode toggle */}
        <button
          onClick={() => setViewMode("intel")}
          className={`flex items-center gap-1 touch-target px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border ${
            viewMode === "intel"
              ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
              : "text-sig-dim bg-transparent border-sig-border/40 hover:text-sig-bright"
          }`}
        >
          <Eye size={9} strokeWidth={2.5} />
          INTEL
        </button>
        <button
          onClick={() => setViewMode("raw")}
          className={`flex items-center gap-1 touch-target px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border ${
            viewMode === "raw"
              ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
              : "text-sig-dim bg-transparent border-sig-border/40 hover:text-sig-bright"
          }`}
        >
          <List size={9} strokeWidth={2.5} />
          RAW
        </button>

        {viewMode === "raw" && (
          <>
            <div className="w-px h-3 bg-sig-border/40 shrink-0 mx-0.5" />
            <Filter
              size={9}
              strokeWidth={2.5}
              className="text-sig-dim shrink-0"
            />
            <button
              onClick={() => setFeedFilter("all")}
              className={`touch-target px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border ${
                feedFilter === "all"
                  ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
                  : "text-sig-dim bg-transparent border-sig-border/40"
              }`}
            >
              ALL
            </button>
            {(["events", "quakes", "fires", "weather"] as const).map((type) => {
              const Icon = TYPE_ICONS[type] ?? Zap;
              const color = colorMap[type];
              const active = feedFilter === type;
              return (
                <button
                  key={type}
                  onClick={() => setFeedFilter(active ? "all" : type)}
                  className={`flex items-center gap-1 touch-target px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border ${
                    active
                      ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
                      : "text-sig-dim bg-transparent border-sig-border/40"
                  }`}
                >
                  <Icon size={9} strokeWidth={2.5} style={{ color }} />
                  {typeCounts[type] ?? 0}
                </button>
              );
            })}
          </>
        )}

        <div className="flex-1" />

        {/* Watch indicator */}
        {isIntelActive && (
          <span className="text-[10px] text-sig-accent tracking-wider font-mono shrink-0 px-1.5 py-0.5 rounded bg-sig-accent/10 border border-sig-accent/30 mr-1">
            WATCHING
          </span>
        )}

        <span className="text-sig-dim text-(length:--sig-text-sm) shrink-0">
          {viewMode === "intel"
            ? `${correlation.products.length} products`
            : `${rawItems.length} items`}
        </span>
      </div>

      {/* Watch progress bar */}
      {isIntelActive && (
        <div className="h-0.5 bg-sig-border/20 shrink-0">
          <div
            className="h-full bg-sig-accent transition-all duration-100"
            style={{ width: `${watchProgress * 100}%` }}
          />
        </div>
      )}

      {/* ── Intel view ──────────────────────────────────────────────── */}
      {viewMode === "intel" && (
        <div className="flex-1 overflow-y-auto sigint-scroll">
          {/* Summary bar */}
          {correlation.products.length > 0 && (
            <div className="px-3 py-2 border-b border-sig-border/30 text-(length:--sig-text-sm) text-sig-dim">
              {correlation.products.filter((p) => p.type === "cross-source")
                .length > 0 && (
                <span className="mr-3">
                  <Link2 size={10} className="inline mr-1" strokeWidth={2.5} />
                  {
                    correlation.products.filter(
                      (p) => p.type === "cross-source",
                    ).length
                  }{" "}
                  correlations
                </span>
              )}
              {correlation.products.filter((p) => p.type === "anomaly").length >
                0 && (
                <span className="mr-3">
                  <AlertTriangle
                    size={10}
                    className="inline mr-1"
                    strokeWidth={2.5}
                  />
                  {
                    correlation.products.filter((p) => p.type === "anomaly")
                      .length
                  }{" "}
                  anomalies
                </span>
              )}
              {correlation.products.filter((p) => p.type === "cluster").length >
                0 && (
                <span className="mr-3">
                  <Layers size={10} className="inline mr-1" strokeWidth={2.5} />
                  {
                    correlation.products.filter((p) => p.type === "cluster")
                      .length
                  }{" "}
                  clusters
                </span>
              )}
            </div>
          )}

          {/* Products */}
          {correlation.products.map((product) => {
            const Icon = PRODUCT_ICONS[product.type] ?? Zap;
            const typeLabel =
              PRODUCT_LABELS[product.type] ?? product.type.toUpperCase();
            const isExpanded = expandedId === product.id;
            const hasDetails =
              product.sources.length > 0 ||
              (product.newsLinks && product.newsLinks.length > 0);
            const hasGeo = product.sources.length > 0;
            const isWatchTarget = watchTargetProductId === product.id;
            const isProductSelected =
              hasGeo &&
              selectedCurrent != null &&
              product.sources.some((s) => s.id === selectedCurrent.id);

            return (
              <div
                key={product.id}
                ref={isWatchTarget ? watchTargetRef : undefined}
                className={`border-b border-sig-border/20 ${isWatchTarget ? "ring-1 ring-sig-accent/30" : ""}`}
              >
                {/* Product header */}
                <div
                  onClick={() => {
                    toggleExpand(product.id);
                    if (hasGeo) handleItemClick(product.sources[0]!);
                  }}
                  className={`px-3 py-2 transition-colors cursor-pointer hover:bg-sig-panel/40 ${
                    isWatchTarget
                      ? "bg-sig-accent/15"
                      : isProductSelected
                        ? "bg-sig-accent/10"
                        : isExpanded
                          ? "bg-sig-accent/5 border-l-2 border-l-sig-accent/30"
                          : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      size={12}
                      strokeWidth={2.5}
                      className="text-sig-accent shrink-0"
                    />
                    <span className="text-[10px] font-bold tracking-widest text-sig-accent shrink-0">
                      {typeLabel}
                    </span>
                    <PriorityBadge priority={product.priority} />
                    {!hasGeo && (
                      <span className="text-[9px] tracking-wider text-sig-dim bg-sig-dim/10 border border-sig-dim/20 rounded px-1 py-0 shrink-0">
                        NON-GEO
                      </span>
                    )}
                    <span className="text-(length:--sig-text-sm) text-sig-dim shrink-0 ml-auto">
                      {product.region}
                    </span>
                  </div>
                  <div className="text-sig-bright text-(length:--sig-text-md) mt-1 leading-snug">
                    {product.title}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-(length:--sig-text-sm) text-sig-dim">
                      {product.summary}
                    </span>
                    <span className="ml-auto shrink-0 text-sig-dim">
                      {isExpanded ? (
                        <ChevronDown size={12} strokeWidth={2.5} />
                      ) : (
                        <ChevronRight size={12} strokeWidth={2.5} />
                      )}
                    </span>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-2 space-y-1">
                    {/* Source data points */}
                    {product.sources.length > 0 && (
                      <div className="pl-2 border-l-2 border-sig-accent/20 space-y-1">
                        {product.sources.slice(0, 8).map((src) => {
                          const SrcIcon = TYPE_ICONS[src.type] ?? Zap;
                          const srcColor =
                            colorMap[src.type] ?? theme.colors.dim;
                          return (
                            <div
                              key={src.id}
                              className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-sig-panel/30 rounded px-1 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleItemClick(src);
                              }}
                            >
                              <SrcIcon
                                size={10}
                                strokeWidth={2.5}
                                style={{ color: srcColor }}
                                className="shrink-0"
                              />
                              <span className="text-(length:--sig-text-sm) text-sig-text truncate flex-1">
                                {rawHeadline(src)}
                              </span>
                              <button
                                onClick={(e) => handleZoomTo(src, e)}
                                className="p-0.5 rounded text-sig-dim hover:text-sig-accent transition-colors shrink-0"
                                title="Zoom to"
                              >
                                <Locate size={10} strokeWidth={2.5} />
                              </button>
                            </div>
                          );
                        })}
                        {product.sources.length > 8 && (
                          <div className="text-(length:--sig-text-sm) text-sig-dim px-1">
                            +{product.sources.length - 8} more
                          </div>
                        )}
                      </div>
                    )}

                    {/* Linked news articles */}
                    {product.newsLinks && product.newsLinks.length > 0 && (
                      <div className="pl-2 border-l-2 border-sig-accent/20 space-y-1 mt-1">
                        <div className="text-[10px] text-sig-dim tracking-wider font-semibold">
                          RELATED NEWS
                        </div>
                        {product.newsLinks.map((article) => (
                          <a
                            key={article.id}
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2 py-0.5 text-(length:--sig-text-sm) text-sig-accent hover:text-sig-bright transition-colors"
                          >
                            <Newspaper
                              size={10}
                              strokeWidth={2.5}
                              className="shrink-0"
                            />
                            <span className="truncate flex-1">
                              {article.title}
                            </span>
                            <ExternalLink
                              size={9}
                              strokeWidth={2.5}
                              className="shrink-0 opacity-50"
                            />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Non-geo product with no sources or news */}
                    {product.sources.length === 0 &&
                      (!product.newsLinks ||
                        product.newsLinks.length === 0) && (
                        <div className="pl-2 border-l-2 border-sig-dim/20 py-1">
                          <span className="text-(length:--sig-text-sm) text-sig-dim">
                            Statistical observation — no geographic source data.
                            Derived from regional baseline analysis.
                          </span>
                        </div>
                      )}
                  </div>
                )}
              </div>
            );
          })}

          {correlation.products.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-sig-dim">
              <Eye size={24} className="opacity-20 mb-2" />
              <span className="text-(length:--sig-text-md)">
                No intel products
              </span>
              <span className="text-(length:--sig-text-sm) mt-1 text-center px-4">
                Correlations appear when multiple data sources show related
                activity
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Raw feed view ───────────────────────────────────────────── */}
      {viewMode === "raw" && (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto sigint-scroll"
        >
          <div style={{ height: totalHeight, position: "relative" }}>
            <div
              style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}
            >
              {visibleRaw.map((item) => {
                const Icon = TYPE_ICONS[item.type] ?? Zap;
                const color = colorMap[item.type] ?? theme.colors.dim;
                const isSelected = selectedCurrent?.id === item.id;
                const showSelected =
                  isSelected && (!watchActive || isIntelActive);
                const severity = rawSeverity(item);
                const headline = rawHeadline(item);
                const source = rawSource(item);
                const category = rawCategory(item);
                const location = rawLocation(item);
                const url = rawUrl(item);
                const age = relativeAge(item.timestamp);

                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`px-3 py-1.5 border-b border-sig-border/20 cursor-pointer transition-colors ${
                      showSelected
                        ? "bg-sig-accent/10"
                        : "bg-transparent hover:bg-sig-panel/40"
                    }`}
                    style={{ height: RAW_ROW_HEIGHT }}
                  >
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
                    <div className="text-sig-text text-(length:--sig-text-md) mt-0.5 truncate ml-5">
                      {headline}
                    </div>
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
          {rawItems.length === 0 && (
            <div className="flex items-center justify-center h-full text-sig-dim text-(length:--sig-text-md)">
              No intel data available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
