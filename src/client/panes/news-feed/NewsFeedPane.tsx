import { useState, useMemo, useEffect, useCallback } from "react";
import { Rss, ExternalLink, ArrowLeft, RefreshCw, Filter } from "lucide-react";
import { useVirtualScroll } from "@/hooks/useVirtualScroll";
import { relativeAge } from "@/lib/timeFormat";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";
import { useNewsData } from "./useNewsData";
import type { NewsArticle } from "./newsProvider";

// ── Constants ───────────────────────────────────────────────────────

const ROW_HEIGHT = 72;
const OVERSCAN = 6;

// ── State persistence ───────────────────────────────────────────────

type SavedNewsState = {
  selectedId: string | null;
  sourceFilter: string | null;
};

function loadNewsState(): SavedNewsState {
  const saved = cacheGet<SavedNewsState>(CACHE_KEYS.newsState);
  if (saved && typeof saved === "object") {
    return {
      selectedId: saved.selectedId ?? null,
      sourceFilter: saved.sourceFilter ?? null,
    };
  }
  return { selectedId: null, sourceFilter: null };
}

function saveNewsState(state: SavedNewsState): void {
  cacheSet(CACHE_KEYS.newsState, state);
}

// ── Source list for filter buttons ──────────────────────────────────

const ALL_SOURCES = [
  "Reuters via Google",
  "NYT World",
  "BBC World",
  "Al Jazeera",
  "The Guardian",
  "NPR World",
] as const;

// ── Component ───────────────────────────────────────────────────────

export function NewsFeedPane() {
  const { data: articles, loading, dataSource } = useNewsData();

  const [sourceFilter, setSourceFilter] = useState<string | null>(
    () => loadNewsState().sourceFilter,
  );
  const [selected, setSelected] = useState<NewsArticle | null>(null);

  // Restore selected article from saved ID once articles load (one-time only)
  const [restored, setRestored] = useState(false);
  const savedId = useMemo(() => loadNewsState().selectedId, []);
  useEffect(() => {
    if (restored || !savedId || articles.length === 0) return;
    const match = articles.find((a) => a.id === savedId);
    if (match) setSelected(match);
    setRestored(true);
  }, [articles, savedId, restored]);

  // Persist state on changes
  const updateSourceFilter = useCallback(
    (f: string | null) => {
      setSourceFilter(f);
      saveNewsState({ selectedId: selected?.id ?? null, sourceFilter: f });
    },
    [selected],
  );

  const updateSelected = useCallback(
    (article: NewsArticle | null) => {
      setSelected(article);
      saveNewsState({ selectedId: article?.id ?? null, sourceFilter });
    },
    [sourceFilter],
  );

  // ── Filtered list ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!sourceFilter) return articles;
    return articles.filter((a) => a.source === sourceFilter);
  }, [articles, sourceFilter]);

  // ── Source counts ──────────────────────────────────────────────
  const sourceCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of articles) {
      c[a.source] = (c[a.source] ?? 0) + 1;
    }
    return c;
  }, [articles]);

  // ── Virtual scroll ─────────────────────────────────────────────
  const { scrollRef, totalHeight, offsetY, startIdx, endIdx, onScroll } =
    useVirtualScroll({
      itemCount: filtered.length,
      rowHeight: ROW_HEIGHT,
      overscan: OVERSCAN,
    });

  const visible = useMemo(
    () => filtered.slice(startIdx, endIdx),
    [filtered, startIdx, endIdx],
  );

  // ── Detail view ────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="w-full h-full flex flex-col bg-sig-bg overflow-hidden">
        <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-sig-border/40">
          <button
            onClick={() => updateSelected(null)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-transparent border border-sig-border/50 hover:text-sig-accent transition-colors"
          >
            <ArrowLeft size={10} strokeWidth={2.5} />
            BACK
          </button>
          <div className="flex-1" />
          <a
            href={selected.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-transparent border border-sig-border/50 hover:text-sig-accent transition-colors"
          >
            <ExternalLink size={10} strokeWidth={2.5} />
            OPEN
          </a>
        </div>

        <div className="flex-1 overflow-y-auto sigint-scroll p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sig-accent text-(length:--sig-text-sm) tracking-wider font-semibold">
              {selected.source}
            </span>
            <span className="text-sig-dim text-(length:--sig-text-sm)">
              {relativeAge(selected.publishedAt, "verbose")}
            </span>
          </div>

          <h2 className="text-sig-bright font-mono tracking-wider text-(length:--sig-text-lg) leading-snug">
            {selected.title}
          </h2>

          {selected.description && (
            <p className="text-sig-text text-(length:--sig-text-md) leading-relaxed">
              {selected.description}
            </p>
          )}

          <div className="pt-2 border-t border-sig-border/30">
            <a
              href={selected.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sig-accent text-(length:--sig-text-sm) hover:underline"
            >
              <ExternalLink size={11} strokeWidth={2.5} />
              Read full article at {selected.source}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col bg-sig-bg overflow-hidden">
      {/* Filter bar */}
      <div className="shrink-0 flex flex-wrap items-center gap-1 px-2 py-1 border-b border-sig-border/40">
        <Filter size={11} strokeWidth={2.5} className="text-sig-dim shrink-0" />
        <button
          onClick={() => updateSourceFilter(null)}
          className={`shrink-0 px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors border ${
            sourceFilter === null
              ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
              : "text-sig-dim bg-transparent border-sig-border/50"
          }`}
        >
          ALL ({articles.length})
        </button>
        {ALL_SOURCES.map((src) => {
          const count = sourceCounts[src] ?? 0;
          if (count === 0) return null;
          const active = sourceFilter === src;
          return (
            <button
              key={src}
              onClick={() => updateSourceFilter(active ? null : src)}
              className={`shrink-0 px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors border ${
                active
                  ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
                  : "text-sig-dim bg-transparent border-sig-border/50"
              }`}
            >
              {src.replace(" via Google", "").replace(" World", "")} ({count})
            </button>
          );
        })}
        <div className="flex-1" />
        <span className="text-sig-dim text-(length:--sig-text-sm) shrink-0">
          {dataSource === "loading" || loading ? "..." : `${filtered.length}`}
        </span>
      </div>

      {/* Virtual scroll list */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto sigint-scroll"
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div
            style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}
          >
            {visible.map((article) => (
              <div
                key={article.id}
                onClick={() => updateSelected(article)}
                className="px-3 py-2 border-b border-sig-border/20 cursor-pointer transition-colors bg-transparent hover:bg-sig-panel/40"
                style={{ height: ROW_HEIGHT }}
              >
                {/* Row 1: source + age */}
                <div className="flex items-center gap-2">
                  <Rss
                    size={10}
                    strokeWidth={2.5}
                    className="text-sig-accent shrink-0"
                  />
                  <span className="text-sig-accent text-(length:--sig-text-sm) font-semibold tracking-wider truncate">
                    {article.source
                      .replace(" via Google", "")
                      .replace(" World", "")}
                  </span>
                  <span className="ml-auto text-(length:--sig-text-sm) text-sig-dim shrink-0">
                    {relativeAge(article.publishedAt)}
                  </span>
                </div>
                {/* Row 2: title */}
                <div className="text-sig-text text-(length:--sig-text-md) mt-0.5 truncate">
                  {article.title}
                </div>
                {/* Row 3: snippet */}
                {article.description && (
                  <div className="text-sig-dim text-(length:--sig-text-sm) mt-0.5 truncate">
                    {article.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {filtered.length === 0 && !loading && (
          <div className="flex items-center justify-center h-full text-sig-dim text-(length:--sig-text-md)">
            No news articles available
          </div>
        )}
        {filtered.length === 0 && loading && (
          <div className="flex items-center justify-center h-full text-sig-dim text-(length:--sig-text-md)">
            Loading feeds...
          </div>
        )}
      </div>
    </div>
  );
}
