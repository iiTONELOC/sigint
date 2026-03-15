import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";
import { featureRegistry } from "@/features/registry";
import type { DataPoint } from "@/features/base/dataPoints";
import { mono, FONT_BTN, FONT_SM, FONT_MD } from "./styles";

// ── Search engine ────────────────────────────────────────────────────

interface SearchResult {
  item: DataPoint;
  score: number;
  primary: string;
  secondary: string;
}

function getPrimaryLabel(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case "aircraft":
      return (d.callsign as string) || (d.icao24 as string) || item.id;
    case "ships":
      return (d.name as string) || item.id;
    case "events":
      return (d.headline as string) || item.id;
    case "quakes":
      return (d.location as string) || item.id;
    default:
      //@ts-ignore
      return item?.id || "Unknown";
  }
}

function getSecondaryLabel(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case "aircraft": {
      const parts: string[] = [];
      if (d.acType && d.acType !== "Unknown") parts.push(d.acType as string);
      if (d.originCountry) parts.push(d.originCountry as string);
      if (d.operator) parts.push(d.operator as string);
      return parts.join(" · ") || "Unknown";
    }
    case "ships":
      return [d.vesselType, d.flag].filter(Boolean).join(" · ") || "";
    case "events":
      return [d.category, d.source].filter(Boolean).join(" · ") || "";
    case "quakes":
      return d.magnitude != null ? `M${d.magnitude}` : "";
    default:
      return "";
  }
}

function scoreMatch(
  query: string,
  searchText: string,
  primary: string,
): number {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const st = searchText.toLowerCase();
  const pl = primary.toLowerCase();

  // All words must appear
  for (const w of words) {
    if (!st.includes(w)) return 0;
  }

  let score = 1;

  // Exact match on primary field
  if (pl === q) return 100;

  // Primary starts with query
  if (pl.startsWith(q)) score += 50;

  // Any word is an exact match on primary
  for (const w of words) {
    if (pl === w) score += 30;
    else if (pl.startsWith(w)) score += 15;
  }

  // Earlier position = higher score
  for (const w of words) {
    const idx = st.indexOf(w);
    if (idx >= 0) score += Math.max(0, 10 - idx * 0.5);
  }

  return score;
}

/** Returns ALL matching items (for globe filtering) and top 15 scored (for dropdown). */
function searchData(
  query: string,
  data: DataPoint[],
): { allMatches: SearchResult[]; topResults: SearchResult[] } {
  if (!query.trim()) return { allMatches: [], topResults: [] };

  const allMatches: SearchResult[] = [];

  for (const item of data) {
    const feature = featureRegistry.get(item.type);
    if (!feature?.getSearchText) continue;

    const searchText = feature.getSearchText(item.data as never);
    if (!searchText) continue;

    const primary = getPrimaryLabel(item);
    const score = scoreMatch(query, searchText, primary);

    if (score > 0) {
      allMatches.push({
        item,
        score,
        primary,
        secondary: getSecondaryLabel(item),
      });
    }
  }

  allMatches.sort((a, b) => b.score - a.score);
  const topResults = allMatches.slice(0, 15);

  return { allMatches, topResults };
}

// ── Component ────────────────────────────────────────────────────────

interface SearchProps {
  readonly data: DataPoint[];
  readonly onSelect: (item: DataPoint) => void;
  readonly onZoomTo: (item: DataPoint) => void;
  /** Called with the Set of all matching IDs when search is active, or null when inactive. */
  readonly onMatchingIdsChange: (ids: Set<string> | null) => void;
}

export function Search({
  data,
  onSelect,
  onZoomTo,
  onMatchingIdsChange,
}: SearchProps) {
  const { theme } = useTheme();
  const C = theme.colors;
  const colorMap = getColorMap(theme);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { allMatches, topResults } = useMemo(
    () => searchData(query, data),
    [query, data],
  );

  // Commit the current matches to the globe filter
  const commitFilter = useCallback(() => {
    if (!query.trim() || allMatches.length === 0) return;
    const ids = new Set(allMatches.map((r) => r.item.id));
    onMatchingIdsChange(ids);
  }, [query, allMatches, onMatchingIdsChange]);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Group top results by type
  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of topResults) {
      const existing = map.get(r.item.type);
      if (existing) existing.push(r);
      else map.set(r.item.type, [r]);
    }
    return map;
  }, [topResults]);

  const selectResult = useCallback(
    (result: SearchResult) => {
      onSelect(result.item);
      onZoomTo(result.item);
      commitFilter();
    },
    [onSelect, onZoomTo, commitFilter],
  );

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
    onMatchingIdsChange(null);
  }, [onMatchingIdsChange]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeSearch();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeSearch]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSearch();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, topResults.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && topResults[activeIndex]) {
          // Select + zoom to specific result, also commits filter
          selectResult(topResults[activeIndex]);
        } else {
          // No specific result highlighted — just commit the filter to the globe
          commitFilter();
        }
      }
    },
    [topResults, activeIndex, selectResult, closeSearch, commitFilter],
  );

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(-1);
  }, [topResults]);

  // Match count for the filter indicator
  const matchCount = allMatches.length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-1.5 md:px-2 py-0.5 rounded tracking-wide font-semibold transition-all"
        style={{
          ...mono(C.dim, FONT_BTN),
          background: "transparent",
          border: `1px solid ${C.border}`,
          cursor: "pointer",
        }}
        title="Search (Ctrl+K)"
      >
        <SearchIcon size={14} strokeWidth={2.5} />
        <span className="hidden md:inline">SEARCH</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative z-[60]">
      {/* Input */}
      <div
        className="flex items-center gap-1.5 rounded px-2 py-0.5"
        style={{
          background: `${C.panel}`,
          border: `1px solid ${C.accent}70`,
          minWidth: 220,
        }}
      >
        <SearchIcon
          size={14}
          strokeWidth={2.5}
          style={{ color: C.accent, flexShrink: 0 }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="callsign, ICAO, type..."
          className="bg-transparent outline-none flex-1 min-w-0"
          style={{
            ...mono(C.bright, FONT_MD),
            caretColor: C.accent,
          }}
        />
        {query.trim() && matchCount > 0 && (
          <span
            className="flex-shrink-0 tracking-wider"
            style={mono(C.accent, FONT_SM)}
          >
            {matchCount}
          </span>
        )}
        <button
          title="Close"
          onClick={closeSearch}
          className="flex-shrink-0"
          style={{
            color: C.dim,
            cursor: "pointer",
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* Results dropdown */}
      {query.trim() && (
        <div
          className="absolute top-full left-0 mt-1 rounded overflow-hidden overflow-y-auto search-results-scroll"
          style={{
            background: `${C.panel}f5`,
            border: `1px solid ${C.border}`,
            backdropFilter: "blur(12px)",
            maxHeight: 360,
            minWidth: 300,
            width: "max-content",
            maxWidth: "min(400px, 90vw)",
          }}
        >
          {topResults.length === 0 ? (
            <div className="px-3 py-2.5" style={mono(C.dim, FONT_SM)}>
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            Array.from(grouped.entries()).map(([type, items]) => {
              const feature = featureRegistry.get(type);
              if (!feature) return null;
              const Icon = feature.icon;
              const color = colorMap[type] ?? C.dim;

              return (
                <div key={type}>
                  {/* Group header */}
                  <div
                    className="px-3 py-1 tracking-wider"
                    style={{
                      ...mono(color, FONT_SM),
                      background: `${color}10`,
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    {feature.label}
                  </div>

                  {/* Results */}
                  {items.map((result) => {
                    const flatIdx = topResults.indexOf(result);
                    const isActive = flatIdx === activeIndex;

                    return (
                      <button
                        key={result.item.id}
                        onClick={() => selectResult(result)}
                        className="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors"
                        style={{
                          background: isActive
                            ? `${C.accent}18`
                            : "transparent",
                          cursor: "pointer",
                          border: "none",
                          borderBottom: `1px solid ${C.border}50`,
                        }}
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                      >
                        <Icon
                          size={13}
                          style={{ color, flexShrink: 0 }}
                          strokeWidth={2.5}
                        />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div
                            className="truncate"
                            style={mono(C.bright, FONT_MD)}
                          >
                            {result.primary}
                          </div>
                          {result.secondary && (
                            <div
                              className="truncate"
                              style={mono(C.dim, FONT_SM)}
                            >
                              {result.secondary}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
