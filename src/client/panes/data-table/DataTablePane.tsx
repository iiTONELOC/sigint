import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useData } from "@/context/DataContext";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";
import type { DataPoint } from "@/features/base/dataPoints";
import { featureRegistry, featureList } from "@/features/registry";
import { Filter, ArrowUpDown, ArrowUp, ArrowDown, Locate } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type SortKey = "type" | "name" | "lat" | "lon" | "value1" | "value2" | "age";
type SortDir = "asc" | "desc";

// ── Constants ───────────────────────────────────────────────────────

const ROW_HEIGHT = 28;
const OVERSCAN = 8;

// ── Helpers ─────────────────────────────────────────────────────────

function getName(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case "aircraft":
      return (
        ((d.callsign as string) || "").trim() || (d.icao24 as string) || item.id
      );
    case "ships":
      return (d.name as string) || item.id;
    case "events":
      return (d.headline as string) || item.id;
    case "quakes":
      return (d.location as string) || item.id;
    default:
      //@ts-ignore
      return item.id;
  }
}

function getValue1(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case "aircraft":
      return (d.acType as string) || "";
    case "ships":
      return (d.vesselType as string) || "";
    case "events":
      return (d.category as string) || "";
    case "quakes":
      return d.magnitude != null ? `M${d.magnitude}` : "";
    default:
      return "";
  }
}

function getValue1Num(item: DataPoint): number {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case "quakes":
      return (d.magnitude as number) ?? 0;
    case "events":
      return (d.severity as number) ?? 0;
    default:
      return 0;
  }
}

function getValue2(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case "aircraft": {
      const alt = d.altitude as number | undefined;
      return alt != null ? `${alt.toLocaleString()} ft` : "";
    }
    case "ships": {
      const spd = d.speed as number | undefined;
      return spd != null ? `${spd.toFixed(1)} kn` : "";
    }
    case "events":
      return (d.source as string) || "";
    case "quakes": {
      const depth = d.depth as number | undefined;
      return depth != null ? `${depth.toFixed(1)} km` : "";
    }
    default:
      return "";
  }
}

function getValue2Num(item: DataPoint): number {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case "aircraft":
      return (d.altitude as number) ?? 0;
    case "ships":
      return (d.speed as number) ?? 0;
    case "quakes":
      return (d.depth as number) ?? 0;
    default:
      return 0;
  }
}

function getAge(item: DataPoint): number {
  if (!item.timestamp) return 0;
  return Date.now() - new Date(item.timestamp).getTime();
}

function relativeAge(item: DataPoint): string {
  if (!item.timestamp) return "LIVE";
  const diff = Date.now() - new Date(item.timestamp).getTime();
  if (diff < 60_000) return "LIVE";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// ── Column definitions ──────────────────────────────────────────────

const COLUMNS: {
  key: SortKey;
  shortLabel: string;
  width: string;
  align?: "right";
}[] = [
  { key: "type", shortLabel: "TYPE", width: "64px" },
  { key: "name", shortLabel: "NAME", width: "1fr" },
  { key: "value1", shortLabel: "CLS", width: "90px" },
  { key: "value2", shortLabel: "DTL", width: "80px", align: "right" },
  { key: "lat", shortLabel: "LAT", width: "72px", align: "right" },
  { key: "lon", shortLabel: "LON", width: "72px", align: "right" },
  { key: "age", shortLabel: "AGE", width: "48px", align: "right" },
];

// ── Component ───────────────────────────────────────────────────────

export function DataTablePane() {
  const { allData, filters, selectedCurrent, setSelected, setZoomToId } =
    useData();
  const { theme } = useTheme();
  const colorMap = useMemo(() => getColorMap(theme), [theme]);

  const [sortKey, setSortKey] = useState<SortKey>("type");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

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

  // ── Filter ──────────────────────────────────────────────────────

  const filteredData = useMemo(() => {
    let items = allData.filter((item) => {
      const feature = featureRegistry.get(item.type);
      if (!feature) return false;
      const filter = filters[item.type];
      if (filter == null) return false;
      return feature.matchesFilter(item as any, filter);
    });
    if (typeFilter) items = items.filter((item) => item.type === typeFilter);
    return items;
  }, [allData, filters, typeFilter]);

  // ── Sort ────────────────────────────────────────────────────────

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    const dir = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "type":
          cmp = a.type.localeCompare(b.type);
          break;
        case "name":
          cmp = getName(a).localeCompare(getName(b));
          break;
        case "lat":
          cmp = a.lat - b.lat;
          break;
        case "lon":
          cmp = a.lon - b.lon;
          break;
        case "value1":
          cmp =
            getValue1Num(a) - getValue1Num(b) ||
            getValue1(a).localeCompare(getValue1(b));
          break;
        case "value2":
          cmp = getValue2Num(a) - getValue2Num(b);
          break;
        case "age":
          cmp = getAge(a) - getAge(b);
          break;
      }
      return cmp * dir;
    });
    return sorted;
  }, [filteredData, sortKey, sortDir]);

  // ── Virtual window ──────────────────────────────────────────────

  const totalHeight = sortedData.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(
    sortedData.length,
    Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN,
  );
  const offsetY = startIdx * ROW_HEIGHT;
  const visibleItems = useMemo(
    () => sortedData.slice(startIdx, endIdx),
    [sortedData, startIdx, endIdx],
  );

  // ── Auto-scroll to selected item ────────────────────────────────
  useEffect(() => {
    if (!selectedCurrent || !scrollRef.current) return;
    const idx = sortedData.findIndex((d) => d.id === selectedCurrent.id);
    if (idx < 0) return;
    const itemTop = idx * ROW_HEIGHT;
    const itemBottom = itemTop + ROW_HEIGHT;
    const el = scrollRef.current;
    // Only scroll if item is outside the visible viewport
    if (itemTop < el.scrollTop || itemBottom > el.scrollTop + viewportH) {
      el.scrollTop = Math.max(0, itemTop - ROW_HEIGHT * 2);
    }
  }, [selectedCurrent?.id, sortedData, viewportH]);

  // ── Feature counts ──────────────────────────────────────────────

  const featureCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of allData) {
      const feature = featureRegistry.get(item.type);
      if (!feature) continue;
      const filter = filters[item.type];
      if (filter == null) continue;
      if (!feature.matchesFilter(item as any, filter)) continue;
      counts[item.type] = (counts[item.type] ?? 0) + 1;
    }
    return counts;
  }, [allData, filters]);

  // ── Handlers ────────────────────────────────────────────────────

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const handleRowClick = useCallback(
    (item: DataPoint) => {
      setSelected(item);
    },
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

  const gridTemplate = COLUMNS.map((c) => c.width).join(" ") + " 32px";

  const typeAbbr: Record<string, string> = {
    aircraft: "AC",
    ships: "AIS",
    events: "EVT",
    quakes: "EQ",
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col bg-sig-bg overflow-hidden">
      {/* Filter bar */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-sig-border/40">
        <Filter size={11} strokeWidth={2.5} className="text-sig-dim shrink-0" />
        <button
          onClick={() => setTypeFilter(null)}
          className={`px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors border ${
            typeFilter === null
              ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
              : "text-sig-dim bg-transparent border-sig-border/50"
          }`}
        >
          ALL ({filteredData.length})
        </button>
        {featureList.map((f) => {
          const Icon = f.icon;
          const color = colorMap[f.id];
          const active = typeFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setTypeFilter(active ? null : f.id)}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors border ${
                active
                  ? "bg-sig-accent/10 border-sig-accent/30"
                  : "bg-transparent border-sig-border/50"
              }`}
              style={{ color: active ? color : undefined }}
            >
              <Icon size={11} strokeWidth={2.5} />
              <span className="hidden sm:inline">
                {featureCounts[f.id] ?? 0}
              </span>
            </button>
          );
        })}
        <div className="flex-1" />
        <span className="text-sig-dim text-(length:--sig-text-sm)">
          {sortedData.length} items
        </span>
      </div>

      {/* Column headers */}
      <div
        className="shrink-0 grid items-center px-2 py-1 border-b border-sig-border/40 bg-sig-panel/40 select-none"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {COLUMNS.map((col) => {
          const active = sortKey === col.key;
          return (
            <button
              key={col.key}
              onClick={() => handleSort(col.key)}
              className={`flex items-center gap-0.5 bg-transparent border-none p-0 tracking-wider text-(length:--sig-text-sm) font-semibold transition-colors ${
                active ? "text-sig-accent" : "text-sig-dim"
              } ${col.align === "right" ? "justify-end" : "justify-start"}`}
            >
              {col.shortLabel}
              {active ? (
                sortDir === "asc" ? (
                  <ArrowUp size={10} strokeWidth={2.5} />
                ) : (
                  <ArrowDown size={10} strokeWidth={2.5} />
                )
              ) : (
                <ArrowUpDown size={9} strokeWidth={2} className="opacity-30" />
              )}
            </button>
          );
        })}
        <div />
      </div>

      {/* Virtual scrolling rows */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto sigint-scroll"
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div
            style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}
          >
            {visibleItems.map((item) => {
              const color = colorMap[item.type] ?? theme.colors.dim;
              const isSelected = selectedCurrent?.id === item.id;
              const feature = featureRegistry.get(item.type);
              if (!feature) return null;
              const Icon = feature.icon;

              return (
                <div
                  key={item.id}
                  onClick={() => handleRowClick(item)}
                  className={`grid items-center px-2 border-b border-sig-border/20 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-sig-accent/10"
                      : "bg-transparent hover:bg-sig-panel/40"
                  }`}
                  style={{
                    gridTemplateColumns: gridTemplate,
                    height: ROW_HEIGHT,
                  }}
                >
                  <div className="flex items-center gap-1 overflow-hidden">
                    <Icon
                      size={11}
                      strokeWidth={2.5}
                      style={{ color }}
                      className="shrink-0"
                    />
                    <span
                      className="tracking-wider text-(length:--sig-text-sm) font-semibold truncate"
                      style={{ color }}
                    >
                      {typeAbbr[item.type] ?? item.type}
                    </span>
                  </div>
                  <div className="truncate text-sig-bright text-(length:--sig-text-md)">
                    {getName(item)}
                  </div>
                  <div className="truncate text-sig-text text-(length:--sig-text-sm)">
                    {getValue1(item)}
                  </div>
                  <div className="text-right truncate text-sig-dim text-(length:--sig-text-sm)">
                    {getValue2(item)}
                  </div>
                  <div className="text-right text-sig-dim text-(length:--sig-text-sm) tabular-nums">
                    {item.lat.toFixed(2)}
                  </div>
                  <div className="text-right text-sig-dim text-(length:--sig-text-sm) tabular-nums">
                    {item.lon.toFixed(2)}
                  </div>
                  <div className="text-right text-sig-dim text-(length:--sig-text-sm)">
                    {relativeAge(item)}
                  </div>
                  <div className="flex justify-center">
                    <button
                      onClick={(e) => handleZoomTo(item, e)}
                      className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
                      title="Zoom to on globe"
                    >
                      <Locate size={11} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {sortedData.length === 0 && (
          <div className="flex items-center justify-center h-full text-sig-dim text-(length:--sig-text-md)">
            No data matching filters
          </div>
        )}
      </div>
    </div>
  );
}
