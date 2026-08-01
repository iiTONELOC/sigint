import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search as SearchIcon, X } from "lucide-react";
import { isMobileWidth } from "@/config/breakpoints";
import { getColorMap, useTheme } from "@/theme";
import { featureRegistry } from "@/features/registry";
import type { DataPoint, DataType } from "@/features/base/dataPoints";
import { useSourceSearch } from "@/features/base/useSourceSearch";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import { Domain } from "@shared/domain/identity";
import { DomEvent, DomInputType, DomKey } from "@/runtime";
import { scorePointSearchMatch } from "@/workers/data/uiQuery";

// ── Search engine ────────────────────────────────────────────────────

enum SearchScoreBoundary {
  Match = 0,
}

enum SearchIconSize {
  Result = 12,
  Control = 13,
}

enum SearchIconStroke {
  Standard = 2.5,
}

enum SearchDropdownLayout {
  Gap = 4,
  MobileInset = 8,
  MinimumWidth = 260,
  MaximumWidth = 360,
  ViewportRatio = 0.9,
}

enum SearchColorSuffix {
  Faint = "10",
}

enum SearchLabel {
  Unknown = "Unknown",
  Separator = " · ",
}

enum SearchClassName {
  ResultButton = "w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors border-none border-b border-sig-border/30",
  ActiveResult = "bg-sig-accent/10",
  InactiveResult = "bg-transparent",
}

type SearchResult = {
  item: DataPoint;
  score: number;
  primary: string;
  secondary: string;
};

function getPrimaryLabel(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case Domain.Aircraft:
      return (d.callsign as string) || (d.icao24 as string) || item.id;
    case Domain.Ships:
      return (d.name as string) || item.id;
    case Domain.Events:
      return (d.headline as string) || item.id;
    case Domain.Quakes:
      return (d.location as string) || item.id;
    default:
      return item.id || SearchLabel.Unknown;
  }
}

function getSecondaryLabel(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case Domain.Aircraft: {
      const parts: string[] = [];
      if (d.acType && d.acType !== SearchLabel.Unknown) {
        parts.push(d.acType as string);
      }
      if (d.originCountry) parts.push(d.originCountry as string);
      if (d.operator) parts.push(d.operator as string);
      return parts.join(SearchLabel.Separator) || SearchLabel.Unknown;
    }
    case Domain.Ships:
      return [d.vesselType, d.flag].filter(Boolean).join(SearchLabel.Separator);
    case Domain.Events:
      return [d.category, d.source].filter(Boolean).join(SearchLabel.Separator);
    case Domain.Quakes:
      return typeof d.magnitude === "number" ? `M${d.magnitude}` : "";
    default:
      return "";
  }
}

function rankMatches(
  query: string,
  data: readonly DataPoint[],
): SearchResult[] {
  if (!query.trim()) return [];
  const allMatches: SearchResult[] = [];
  for (const item of data) {
    const feature = featureRegistry.get(item.type);
    if (!feature?.getSearchText) continue;
    const searchText = feature.getSearchText(item.data as never);
    if (!searchText) continue;
    const primary = getPrimaryLabel(item);
    const score = scorePointSearchMatch(query, searchText, primary);
    if (score > SearchScoreBoundary.Match)
      allMatches.push({
        item,
        score,
        primary,
        secondary: getSecondaryLabel(item),
      });
  }
  allMatches.sort((left, right) => right.score - left.score);
  return allMatches.slice(0, POINT_UI_QUERY_POLICY.searchResultLimit);
}

// ── Component ────────────────────────────────────────────────────────

type SearchProps = {
  readonly onSelect: (item: DataPoint) => void;
  readonly onZoomTo: (item: DataPoint) => void;
  readonly onCommit: (text: string | null) => void;
};

export function Search({ onSelect, onZoomTo, onCommit }: SearchProps) {
  const { theme } = useTheme();
  const C = theme.colors;
  const colorMap = getColorMap(theme);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState<string | null>(null);
  const [committedCount, setCommittedCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const normalizedQuery = query.trim();
  const live = useSourceSearch(normalizedQuery || null);
  const committed = useSourceSearch(committedQuery);

  const topResults = useMemo(
    () => rankMatches(normalizedQuery, live.items),
    [live.items, normalizedQuery],
  );
  const matchingCount = live.total;
  const searchReady = live.ready;

  useEffect(() => {
    if (committedQuery === null || !committed.ready) return;
    setCommittedCount(committed.total);
  }, [committedQuery, committed]);

  const commitFilter = useCallback(() => {
    if (!normalizedQuery || !searchReady || matchingCount === 0) return;
    onCommit(normalizedQuery);
    setCommittedQuery(normalizedQuery);
    setCommittedCount(matchingCount);
    setOpen(false);
    setActiveIndex(-1);
  }, [normalizedQuery, searchReady, matchingCount, onCommit]);

  const clearFilter = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCommittedQuery(null);
    setCommittedCount(0);
    setActiveIndex(-1);
    onCommit(null);
  }, [onCommit]);

  // Ref to focus input immediately when transitioning from button to input.
  // iOS Safari requires .focus() to originate from the user gesture call stack.
  const pendingFocusRef = useRef(false);

  const openSearch = useCallback(() => {
    if (committedQuery && !query) setQuery(committedQuery);
    pendingFocusRef.current = true;
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
      if ((e.metaKey || e.ctrlKey) && e.key === DomKey.KeyK) {
        e.preventDefault();
        openSearch();
      }
    };
    document.addEventListener(DomEvent.KeyDown, handler);
    return () => document.removeEventListener(DomEvent.KeyDown, handler);
  }, [openSearch]);

  const grouped = useMemo(() => {
    const map = new Map<DataType, SearchResult[]>();
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

      // On mobile, scroll back to the top of the pane column so the user
      // sees the globe zoom. The scroll container is the overflow-y-auto
      // parent of [data-pane-id] elements.
      if (isMobileWidth(window.innerWidth)) {
        requestAnimationFrame(() => {
          const firstPane =
            document.querySelector<HTMLElement>("[data-pane-id]");
          if (firstPane) {
            const scrollParent = firstPane.parentElement;
            scrollParent?.scrollTo({ top: 0, behavior: "smooth" });
          }
        });
      }
    },
    [onSelect, onZoomTo, commitFilter],
  );

  // The ref callback fires when the input mounts into the DOM.
  // which is still within the same user gesture microtask on iOS Safari.
  const inputRefCallback = useCallback((el: HTMLInputElement | null) => {
    if (el && pendingFocusRef.current) {
      pendingFocusRef.current = false;
      el.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !dropdownRef.current?.contains(target)
      )
        closeDropdown();
    };
    document.addEventListener(DomEvent.MouseDown, handler);
    document.addEventListener(DomEvent.TouchStart, handler);
    return () => {
      document.removeEventListener(DomEvent.MouseDown, handler);
      document.removeEventListener(DomEvent.TouchStart, handler);
    };
  }, [open, closeDropdown]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === DomKey.Escape) {
        closeDropdown();
        return;
      }
      if (e.key === DomKey.ArrowDown) {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, topResults.length - 1));
        return;
      }
      if (e.key === DomKey.ArrowUp) {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === DomKey.Enter) {
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
          <SearchIcon
            size={SearchIconSize.Result}
            strokeWidth={SearchIconStroke.Standard}
          />
          <span className="max-w-20 truncate">{committedQuery}</span>
          <span className="text-sig-dim text-(length:--sig-text-sm)">
            ({committedCount})
          </span>
        </button>
        <button
          onClick={clearFilter}
          className="text-sig-dim bg-transparent border-none p-0 pl-0.5 touch-target flex items-center justify-center"
          title="Clear filter"
        >
          <X
            size={SearchIconSize.Result}
            strokeWidth={SearchIconStroke.Standard}
          />
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
        <SearchIcon
          size={SearchIconSize.Control}
          strokeWidth={SearchIconStroke.Standard}
        />
        <span className="hidden sm:inline">SEARCH</span>
      </button>
    );
  }

  // ── OPEN state (input + dropdown) ────────────────────────────────
  return (
    <div ref={containerRef} className="relative z-60">
      <div className="flex items-center gap-1.5 rounded px-2 py-0.5 bg-sig-panel border border-sig-accent/45 min-w-45">
        <SearchIcon
          size={SearchIconSize.Control}
          strokeWidth={SearchIconStroke.Standard}
          className="text-sig-accent shrink-0"
        />
        <input
          ref={inputRefCallback}
          type={DomInputType.Text}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="callsign, type..."
          className="bg-transparent outline-none flex-1 min-w-0 text-sig-bright text-(length:--sig-text-md) caret-sig-accent"
        />
        {normalizedQuery && matchingCount > 0 && (
          <span className="shrink-0 tracking-wider text-sig-accent text-(length:--sig-text-sm)">
            {matchingCount}
          </span>
        )}
        <button
          title="Close"
          onClick={closeDropdown}
          className="shrink-0 text-sig-dim bg-transparent border-none p-0"
        >
          <X
            size={SearchIconSize.Control}
            strokeWidth={SearchIconStroke.Standard}
          />
        </button>
      </div>

      {query.trim() &&
        containerRef.current &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-80 rounded overflow-hidden overflow-y-auto sigint-scroll bg-sig-panel/96 border border-sig-border backdrop-blur-md max-h-80"
            style={
              isMobileWidth(window.innerWidth)
                ? {
                    top:
                      containerRef.current.getBoundingClientRect().bottom +
                      SearchDropdownLayout.Gap,
                    left: SearchDropdownLayout.MobileInset,
                    right: SearchDropdownLayout.MobileInset,
                  }
                : {
                    top:
                      containerRef.current.getBoundingClientRect().bottom +
                      SearchDropdownLayout.Gap,
                    left: Math.min(
                      containerRef.current.getBoundingClientRect().left,
                      window.innerWidth -
                        Math.min(
                          SearchDropdownLayout.MaximumWidth,
                          window.innerWidth *
                            SearchDropdownLayout.ViewportRatio,
                        ),
                    ),
                    minWidth: SearchDropdownLayout.MinimumWidth,
                    width: "max-content",
                    maxWidth: Math.min(
                      SearchDropdownLayout.MaximumWidth,
                      window.innerWidth * SearchDropdownLayout.ViewportRatio,
                    ),
                  }
            }
          >
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
                      style={{
                        color,
                        background: `${color}${SearchColorSuffix.Faint}`,
                      }}
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
                          className={`${SearchClassName.ResultButton} ${
                            isActive
                              ? SearchClassName.ActiveResult
                              : SearchClassName.InactiveResult
                          }`}
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                        >
                          <Icon
                            size={SearchIconSize.Result}
                            style={{ color }}
                            className="shrink-0"
                            strokeWidth={SearchIconStroke.Standard}
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
          </div>,
          document.body,
        )}
    </div>
  );
}
