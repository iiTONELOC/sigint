import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";
import { featureRegistry } from "@/features/registry";
import type { DataPoint } from "@/features/base/dataPoints";

// ── Search engine ────────────────────────────────────────────────────

type SearchResult = {
  item: DataPoint;
  score: number;
  primary: string;
  secondary: string;
};

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
  for (const w of words) {
    if (!st.includes(w)) return 0;
  }
  let score = 1;
  if (pl === q) return 100;
  if (pl.startsWith(q)) score += 50;
  for (const w of words) {
    if (pl === w) score += 30;
    else if (pl.startsWith(w)) score += 15;
  }
  for (const w of words) {
    const idx = st.indexOf(w);
    if (idx >= 0) score += Math.max(0, 10 - idx * 0.5);
  }
  return score;
}

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
    if (score > 0)
      allMatches.push({
        item,
        score,
        primary,
        secondary: getSecondaryLabel(item),
      });
  }
  allMatches.sort((a, b) => b.score - a.score);
  return { allMatches, topResults: allMatches.slice(0, 15) };
}

// ── Component ────────────────────────────────────────────────────────

type SearchProps = {
  readonly data: DataPoint[];
  readonly onSelect: (item: DataPoint) => void;
  readonly onZoomTo: (item: DataPoint) => void;
  readonly onMatchingIdsChange: (ids: Set<string> | null) => void;
};

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
  const [committedQuery, setCommittedQuery] = useState<string | null>(null);
  const [committedCount, setCommittedCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { allMatches, topResults } = useMemo(
    () => searchData(query, data),
    [query, data],
  );

  // Re-run committed filter on data refresh
  useEffect(() => {
    if (committedQuery === null) return;
    const { allMatches: refreshed } = searchData(committedQuery, data);
    if (refreshed.length > 0) {
      onMatchingIdsChange(new Set(refreshed.map((r) => r.item.id)));
      setCommittedCount(refreshed.length);
    } else {
      onMatchingIdsChange(null);
      setCommittedCount(0);
    }
  }, [data, committedQuery, onMatchingIdsChange]);

  const commitFilter = useCallback(() => {
    if (!query.trim() || allMatches.length === 0) return;
    onMatchingIdsChange(new Set(allMatches.map((r) => r.item.id)));
    setCommittedQuery(query.trim());
    setCommittedCount(allMatches.length);
    setOpen(false);
    setActiveIndex(-1);
  }, [query, allMatches, onMatchingIdsChange]);

  const clearFilter = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCommittedQuery(null);
    setCommittedCount(0);
    setActiveIndex(-1);
    onMatchingIdsChange(null);
  }, [onMatchingIdsChange]);

  const openSearch = useCallback(() => {
    if (committedQuery && !query) setQuery(committedQuery);
    setOpen(true);
  }, [committedQuery, query]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    if (committedQuery) {
      setQuery(committedQuery);
    } else {
      setQuery("");
    }
  }, [committedQuery]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openSearch();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [openSearch]);

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

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      )
        closeDropdown();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeDropdown]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDropdown();
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
        if (activeIndex >= 0 && topResults[activeIndex])
          selectResult(topResults[activeIndex]);
        else commitFilter();
      }
    },
    [topResults, activeIndex, selectResult, closeDropdown, commitFilter],
  );

  useEffect(() => {
    setActiveIndex(-1);
  }, [topResults]);

  // ── COMMITTED state (chip) ───────────────────────────────────────
  if (!open && committedQuery) {
    return (
      <div className="flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-sig-accent/10 border border-sig-accent/30">
        <button
          onClick={openSearch}
          className="flex items-center gap-1 bg-transparent border-none p-0 text-sig-accent text-(length:--sig-text-btn)"
          title="Edit search"
        >
          <SearchIcon size={12} strokeWidth={2.5} />
          <span className="max-w-20 truncate">{committedQuery}</span>
          <span className="text-sig-dim text-(length:--sig-text-sm)">
            ({committedCount})
          </span>
        </button>
        <button
          onClick={clearFilter}
          className="text-sig-dim bg-transparent border-none p-0 pl-0.5"
          title="Clear filter"
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  // ── IDLE state (button) ──────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={openSearch}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded tracking-wide font-semibold transition-all text-sig-dim text-(length:--sig-text-btn) bg-transparent border border-sig-border"
        title="Search (Ctrl+K)"
      >
        <SearchIcon size={13} strokeWidth={2.5} />
        <span className="hidden sm:inline">SEARCH</span>
      </button>
    );
  }

  // ── OPEN state (input + dropdown) ────────────────────────────────
  return (
    <div ref={containerRef} className="relative z-60">
      <div className="flex items-center gap-1.5 rounded px-2 py-0.5 bg-sig-panel border border-sig-accent/45 min-w-45">
        <SearchIcon
          size={13}
          strokeWidth={2.5}
          className="text-sig-accent shrink-0"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="callsign, type..."
          className="bg-transparent outline-none flex-1 min-w-0 text-sig-bright text-(length:--sig-text-md) caret-sig-accent"
        />
        {query.trim() && allMatches.length > 0 && (
          <span className="shrink-0 tracking-wider text-sig-accent text-(length:--sig-text-sm)">
            {allMatches.length}
          </span>
        )}
        <button
          title="Close"
          onClick={closeDropdown}
          className="shrink-0 text-sig-dim bg-transparent border-none p-0"
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      </div>

      {query.trim() && (
        <div className="absolute top-full left-0 mt-1 rounded overflow-hidden overflow-y-auto sigint-scroll bg-sig-panel/96 border border-sig-border backdrop-blur-md max-h-80 min-w-65 w-max max-w-[min(360px,90vw)]">
          {topResults.length === 0 ? (
            <div className="px-3 py-2.5 text-sig-dim text-(length:--sig-text-sm)">
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
                  <div
                    className="px-3 py-1 tracking-wider text-(length:--sig-text-sm) border-b border-sig-border"
                    style={{ color, background: `${color}10` }}
                  >
                    {feature.label}
                  </div>
                  {items.map((result) => {
                    const flatIdx = topResults.indexOf(result);
                    const isActive = flatIdx === activeIndex;
                    return (
                      <button
                        key={result.item.id}
                        onClick={() => selectResult(result)}
                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors border-none border-b border-sig-border/30 ${
                          isActive ? "bg-sig-accent/10" : "bg-transparent"
                        }`}
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                      >
                        <Icon
                          size={12}
                          style={{ color }}
                          className="shrink-0"
                          strokeWidth={2.5}
                        />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="truncate text-sig-bright text-(length:--sig-text-md)">
                            {result.primary}
                          </div>
                          {result.secondary && (
                            <div className="truncate text-sig-dim text-(length:--sig-text-sm)">
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
