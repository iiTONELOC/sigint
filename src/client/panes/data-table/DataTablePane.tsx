import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { useState, useMemo, useCallback, useEffect } from "react";
import type { AriaAttributes } from "react";
import { useData } from "@/context/DataContext";
import { useTheme } from "@/context/ThemeContext";

import { useVirtualScroll } from "@/hooks/useVirtualScroll";
import type { DataPoint, DataType } from "@/features/base/dataPoints";
import { featureRegistry, featureList } from "@/features/registry";
import { Filter, ArrowUpDown, ArrowUp, ArrowDown, Locate } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { relativeAge } from "@/lib/format/timeFormat";
import { useItemSelectHandlers } from "@/lib/runtime/useItemSelectHandlers";
import { isMobileWidth } from "@/config/breakpoints";
import { mergeSortedPrefixes } from "@/lib/data/mergeSortedPrefix";
import { useSourceTables } from "@/features/base/useSourceTables";

// ── Types ────────────────────────────────────────────────────────────

type SortKey = "type" | "name" | "lat" | "lon" | "value1" | "value2" | "age";
type SortDir = "asc" | "desc";

// ── Constants ───────────────────────────────────────────────────────

const ROW_HEIGHT = 28;
const OVERSCAN = 8;
const INITIAL_QUERY_LIMIT = OVERSCAN * 2;

// ── Helpers ─────────────────────────────────────────────────────────

type AriaSort = NonNullable<AriaAttributes["aria-sort"]>;

/** Screen readers announce the sort state of the column they land on. */
function sortDirectionLabel(active: boolean, ascending: boolean): AriaSort {
  if (!active) return "none";
  return ascending ? "ascending" : "descending";
}

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
    case "fires":
      return d.frp ? `FRP ${(d.frp as number).toFixed(1)} MW` : "Fire hotspot";
    case "weather":
      return (d.event as string) || (d.headline as string) || "Weather Alert";
    default:
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
      return typeof d.magnitude === "number" ? `M${d.magnitude}` : "";
    case "fires":
      return (d.confidence as string)?.toUpperCase() || "";
    case "weather":
      return (d.severity as string) || "";
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
    case "fires":
      return (d.frp as number) ?? 0;
    case "weather": {
      const sev: Record<string, number> = {
        Extreme: 4,
        Severe: 3,
        Moderate: 2,
        Minor: 1,
      };
      return sev[(d.severity as string) ?? ""] ?? 0;
    }
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
    case "fires": {
      const bri = d.brightness as number | undefined;
      return bri != null ? `${bri.toFixed(0)} K` : "";
    }
    case "weather":
      return (d.areaDesc as string)?.split(";")[0]?.trim() || "";
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
    case "fires":
      return (d.brightness as number) ?? 0;
    case "weather":
      return 0;
    default:
      return 0;
  }
}

function getAge(item: DataPoint): number {
  if (!item.timestamp) return 0;
  return Date.now() - new Date(item.timestamp).getTime();
}

function compareDataPoints(
  left: DataPoint,
  right: DataPoint,
  sortKey: SortKey,
  sortDir: SortDir,
): number {
  let comparison = 0;
  if (sortKey === "type") comparison = left.type.localeCompare(right.type);
  else if (sortKey === "name") comparison = getName(left).localeCompare(getName(right));
  else if (sortKey === "lat")
    comparison = recordLatitude(left) - recordLatitude(right);
  else if (sortKey === "lon")
    comparison = recordLongitude(left) - recordLongitude(right);
  else if (sortKey === "value1") {
    comparison =
      getValue1Num(left) - getValue1Num(right) ||
      getValue1(left).localeCompare(getValue1(right));
  } else if (sortKey === "value2") {
    comparison = getValue2Num(left) - getValue2Num(right);
  } else {
    comparison = getAge(left) - getAge(right);
  }
  return comparison * (sortDir === "asc" ? 1 : -1);
}

// ── Column definitions ──────────────────────────────────────────────

const COLUMNS: {
  key: SortKey;
  shortLabel: string;
  tooltip: string;
  width: string;
  mobileWidth?: string;
  hideOnMobile?: boolean;
  align?: "right";
}[] = [
  {
    key: "type",
    shortLabel: "TYPE",
    tooltip: "Entity type",
    width: "64px",
    mobileWidth: "52px",
  },
  {
    key: "name",
    shortLabel: "NAME",
    tooltip: "Callsign / name / headline",
    width: "1fr",
    mobileWidth: "1fr",
  },
  {
    key: "value1",
    shortLabel: "CLS",
    tooltip: "Classification (aircraft type, vessel type, category, magnitude)",
    width: "90px",
    hideOnMobile: true,
  },
  {
    key: "value2",
    shortLabel: "DTL",
    tooltip: "Detail (altitude, speed, severity, FRP)",
    width: "80px",
    mobileWidth: "70px",
    align: "right",
  },
  {
    key: "lat",
    shortLabel: "LAT",
    tooltip: "Latitude",
    width: "72px",
    mobileWidth: "60px",
    align: "right",
  },
  {
    key: "lon",
    shortLabel: "LON",
    tooltip: "Longitude",
    width: "72px",
    hideOnMobile: true,
    align: "right",
  },
  {
    key: "age",
    shortLabel: "AGE",
    tooltip: "Time since last update",
    width: "48px",
    mobileWidth: "40px",
    align: "right",
  },
];

// ── Component ───────────────────────────────────────────────────────

export function DataTablePane() {
  const {
    selectedCurrent,
    setSelected,
    selectAndZoom,
    setRevealId,
    colorMap,
    earthquakeFilter,
    fireFilter,
  } = useData();
  const { theme } = useTheme();

  const [sortKey, setSortKey] = useState<SortKey>("type");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [typeFilter, setTypeFilter] = useState<DataType | null>(null);
  const [sourcePrefixLimit, setSourcePrefixLimit] =
    useState(INITIAL_QUERY_LIMIT);

  // ── Bounded pages, one per source, computed in the DataWorker ────

  const minValues = useMemo(
    () => ({
      earthquake: earthquakeFilter.minMagnitude,
      fire: fireFilter.minConfidence,
    }),
    [earthquakeFilter.minMagnitude, fireFilter.minConfidence],
  );
  const disabled = useMemo(
    () => ({
      earthquake: !earthquakeFilter.enabled,
      fire: !fireFilter.enabled,
    }),
    [earthquakeFilter.enabled, fireFilter.enabled],
  );
  const { prefixes, totals, itemCount } = useSourceTables({
    sortKey,
    sortDirection: sortDir,
    limit: sourcePrefixLimit,
    pointType: typeFilter,
    minValues,
    disabled,
  });

  // ── Virtual scroll ──────────────────────────────────────────────

  const {
    scrollRef,
    totalHeight,
    offsetY,
    startIdx,
    endIdx,
    onScroll,
    scrollToIndex,
  } = useVirtualScroll({
    itemCount,
    rowHeight: ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  useEffect(() => {
    if (endIdx > sourcePrefixLimit) setSourcePrefixLimit(endIdx);
  }, [endIdx, sourcePrefixLimit]);

  const visibleItems = useMemo(
    () =>
      mergeSortedPrefixes(
        prefixes,
        (left, right) => compareDataPoints(left, right, sortKey, sortDir),
        endIdx,
      ).slice(startIdx, endIdx),
    [prefixes, sortKey, sortDir, startIdx, endIdx],
  );

  // ── Auto-scroll to selected item ─────────────────────────────────

  useEffect(() => {
    if (!selectedCurrent) return;
    const prefix = mergeSortedPrefixes(
      prefixes,
      (left, right) => compareDataPoints(left, right, sortKey, sortDir),
      sourcePrefixLimit,
    );
    const index = prefix.findIndex((item) => item.id === selectedCurrent.id);
    if (index >= 0) scrollToIndex(index);
  }, [
    selectedCurrent?.id,
    prefixes,
    sortKey,
    sortDir,
    sourcePrefixLimit,
    scrollToIndex,
  ]);

  const featureCounts = totals;

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

  const {
    handleClick: handleRowClick,
    handleZoom: handleZoomTo,
    handleKeyDown: handleRowKeyDown,
  } = useItemSelectHandlers(setSelected, setRevealId, selectAndZoom);

  const isMobileTable =
    typeof window !== "undefined" && isMobileWidth(window.innerWidth);
  const visibleColumns = isMobileTable
    ? COLUMNS.filter((c) => !c.hideOnMobile)
    : COLUMNS;
  const gridTemplate =
    visibleColumns
      .map((c) => (isMobileTable && c.mobileWidth ? c.mobileWidth : c.width))
      .join(" ") + (isMobileTable ? "" : " 32px");

  const typeAbbr: Record<string, string> = {
    aircraft: "AC",
    ships: "AIS",
    events: "EVT",
    quakes: "EQ",
    fires: "FI",
    weather: "WX",
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col bg-sig-bg overflow-hidden">
      {/* Filter bar */}
      <div className="shrink-0 flex items-center flex-wrap gap-1 px-2 py-1 border-b border-sig-border/40">
        <Filter size={11} strokeWidth={2.5} className="text-sig-dim shrink-0" />
        <button
          onClick={() => setTypeFilter(null)}
          className={`touch-target px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors border ${
            typeFilter === null
              ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
              : "text-sig-dim bg-transparent border-sig-border/50"
          }`}
        >
          ALL
        </button>
        {featureList
          // Warnings are area polygons, not rows in the table.
          .filter((f) => f.id !== "cyclones-warning")
          .map((f) => {
          const Icon = f.icon;
          const color = colorMap[f.id];
          const active = typeFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setTypeFilter(active ? null : f.id)}
              className={`flex items-center gap-0.5 touch-target px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors border ${
                active
                  ? "bg-sig-accent/10 border-sig-accent/30"
                  : "text-sig-dim bg-transparent border-sig-border/50"
              }`}
              style={{ color: active ? color : undefined }}
            >
              <Icon size={11} strokeWidth={2.5} />
              <span>{featureCounts[f.id] ?? 0}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        <span className="text-sig-dim text-(length:--sig-text-sm)">
          {itemCount} items
        </span>
      </div>

      <table className="shrink-0 w-full border-b border-sig-border/40 bg-sig-panel/40 select-none">
        <thead>
          <tr
            className="grid items-center px-2 py-1"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {visibleColumns.map((col) => {
              const active = sortKey === col.key;
              const ascending = active && sortDir === "asc";
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={sortDirectionLabel(active, ascending)}
                  className={
                    col.align === "right" ? "text-right" : "text-left"
                  }
                >
                  <Tooltip content={col.tooltip} placement="bottom">
                    <button
                      onClick={() => handleSort(col.key)}
                      className={`w-full flex items-center gap-0.5 bg-transparent border-none p-0 tracking-wider text-(length:--sig-text-sm) font-semibold transition-colors ${
                        active ? "text-sig-accent" : "text-sig-dim"
                      } ${col.align === "right" ? "justify-end" : "justify-start"}`}
                    >
                      {col.shortLabel}
                      {!active && (
                        <ArrowUpDown
                          size={9}
                          strokeWidth={2}
                          className="opacity-30"
                        />
                      )}
                      {ascending && <ArrowUp size={10} strokeWidth={2.5} />}
                      {active && !ascending && (
                        <ArrowDown size={10} strokeWidth={2.5} />
                      )}
                    </button>
                  </Tooltip>
                </th>
              );
            })}
            {!isMobileTable && <th scope="col" aria-label="Actions" />}
          </tr>
        </thead>
      </table>

      {/* Virtual scrolling rows */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto sigint-scroll"
      >
        <table className="w-full">
          <tbody
            style={{
              display: "block",
              height: totalHeight,
              position: "relative",
            }}
          >
            {visibleItems.map((item, index) => {
              const color = colorMap[item.type] ?? theme.colors.dim;
              const isSelected = selectedCurrent?.id === item.id;
              const feature = featureRegistry.get(item.type);
              if (!feature) return null;
              const Icon = feature.icon;

              return (
                <tr
                  key={item.id}
                  tabIndex={0}
                  onClick={() => handleRowClick(item)}
                  onKeyDown={(e) => handleRowKeyDown(item, e)}
                  className={`grid items-center px-2 border-b border-sig-border/20 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-sig-accent/15 border-l-2 border-l-sig-accent"
                      : "bg-transparent hover:bg-sig-panel/40"
                  }`}
                  style={{
                    gridTemplateColumns: gridTemplate,
                    height: ROW_HEIGHT,
                    position: "absolute",
                    top: offsetY + index * ROW_HEIGHT,
                    left: 0,
                    right: 0,
                  }}
                >
                  <td className="flex items-center gap-1 overflow-hidden">
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
                  </td>
                  <td className="truncate text-sig-bright text-(length:--sig-text-md)">
                    {getName(item)}
                  </td>
                  {!isMobileTable && (
                    <td className="truncate text-sig-text text-(length:--sig-text-sm)">
                      {getValue1(item)}
                    </td>
                  )}
                  <td className="text-right truncate text-sig-dim text-(length:--sig-text-sm)">
                    {getValue2(item)}
                  </td>
                  <td className="text-right text-sig-dim text-(length:--sig-text-sm) tabular-nums">
                    {recordLatitude(item).toFixed(2)}
                  </td>
                  {!isMobileTable && (
                    <td className="text-right text-sig-dim text-(length:--sig-text-sm) tabular-nums">
                      {recordLongitude(item).toFixed(2)}
                    </td>
                  )}
                  <td className="text-right text-sig-dim text-(length:--sig-text-sm)">
                    {relativeAge(item.timestamp)}
                  </td>
                  {!isMobileTable && (
                    <td className="flex justify-center">
                      <button
                        onClick={(e) => handleZoomTo(item, e)}
                        className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
                        title="Zoom to on globe"
                      >
                        <Locate size={11} strokeWidth={2.5} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {itemCount === 0 && (
          <div className="flex items-center justify-center h-full text-sig-dim text-(length:--sig-text-md)">
            No data matching filters
          </div>
        )}
      </div>
    </div>
  );
}
