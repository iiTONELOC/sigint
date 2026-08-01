import { useState, useMemo, useEffect, useCallback } from "react";
import { Rss, ExternalLink, ArrowLeft, Filter } from "lucide-react";
import { useVirtualScroll } from "@/virtual-scroll";
import { AgeStyle, relativeAge } from "@/time";
import { cacheGet, cacheSet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";
import { useData } from "@/context/DataContext";
import type { NewsArticle } from "@/features/news";
import { ButtonType } from "@/lib/ui/button";
import { DomAnchorTarget, DomLinkRelation } from "@/runtime";
import { NewsSource } from "@shared/domain/newsSource";
import { isEnumValue } from "@shared/types/enum";

// ── Constants ───────────────────────────────────────────────────────

enum NewsFeedMetric {
  RowHeight = 72,
  Overscan = 6,
  CompactIcon = 10,
  StandardIcon = 11,
  IconStrokeWidth = 2.5,
}

enum NewsFeedClassName {
  Root = "w-full h-full flex flex-col bg-sig-bg overflow-hidden",
  Spacer = "flex-1",
  FilterActive = "text-sig-accent bg-sig-accent/10 border-sig-accent/30",
  FilterInactive = "text-sig-dim bg-transparent border-sig-border/50",
}

enum NewsSourceSuffix {
  Google = " via Google",
  World = " World",
}

function newsSourceLabel(source: string): string {
  return source
    .replace(NewsSourceSuffix.Google, "")
    .replace(NewsSourceSuffix.World, "");
}

// ── State persistence ───────────────────────────────────────────────

type SavedNewsState = {
  selectedId: string | null;
  sourceFilter: NewsSource | null;
};

function isNewsSource(value: unknown): value is NewsSource {
  return isEnumValue(value, NewsSource);
}

async function loadNewsState(): Promise<SavedNewsState> {
  const saved = await cacheGet<SavedNewsState>(CacheKey.NewsState);
  if (saved && typeof saved === "object") {
    return {
      selectedId: saved.selectedId ?? null,
      sourceFilter: isNewsSource(saved.sourceFilter)
        ? saved.sourceFilter
        : null,
    };
  }
  return { selectedId: null, sourceFilter: null };
}

function saveNewsState(state: SavedNewsState): void {
  cacheSet(CacheKey.NewsState, state);
}

// ── Component ───────────────────────────────────────────────────────

export function NewsFeedPane() {
  const { newsArticles: articles } = useData();

  const [sourceFilter, setSourceFilter] = useState<NewsSource | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    loadNewsState().then((state) => {
      setSourceFilter(state.sourceFilter);
      setSavedId(state.selectedId);
    });
  }, []);
  const [selected, setSelected] = useState<NewsArticle | null>(null);

  // Restore selected article from saved ID once articles load (one-time only)
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restored || !savedId || articles.length === 0) return;
    const match = articles.find((a) => a.id === savedId);
    if (match) setSelected(match);
    setRestored(true);
  }, [articles, savedId, restored]);

  // Persist state on changes
  const updateSourceFilter = useCallback(
    (f: NewsSource | null) => {
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
      rowHeight: NewsFeedMetric.RowHeight,
      overscan: NewsFeedMetric.Overscan,
    });

  const visible = useMemo(
    () => filtered.slice(startIdx, endIdx),
    [filtered, startIdx, endIdx],
  );

  // ── Detail view ────────────────────────────────────────────────
  if (selected) {
    return (
      <div className={NewsFeedClassName.Root}>
        <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-sig-border/40">
          <button
            onClick={() => updateSelected(null)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-transparent border border-sig-border/50 hover:text-sig-accent transition-colors"
          >
            <ArrowLeft
              size={NewsFeedMetric.CompactIcon}
              strokeWidth={NewsFeedMetric.IconStrokeWidth}
            />
            BACK
          </button>
          <div className={NewsFeedClassName.Spacer} />
          <a
            href={selected.url}
            target={DomAnchorTarget.Blank}
            rel={DomLinkRelation.NoopenerNoreferrer}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-transparent border border-sig-border/50 hover:text-sig-accent transition-colors"
          >
            <ExternalLink
              size={NewsFeedMetric.CompactIcon}
              strokeWidth={NewsFeedMetric.IconStrokeWidth}
            />
            OPEN
          </a>
        </div>

        <div className="flex-1 overflow-y-auto sigint-scroll p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sig-accent text-(length:--sig-text-sm) tracking-wider font-semibold">
              {selected.source}
            </span>
            <span className="text-sig-dim text-(length:--sig-text-sm)">
              {relativeAge(selected.publishedAt, AgeStyle.Verbose)}
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
              target={DomAnchorTarget.Blank}
              rel={DomLinkRelation.NoopenerNoreferrer}
              className="inline-flex items-center gap-1.5 text-sig-accent text-(length:--sig-text-sm) hover:underline"
            >
              <ExternalLink
                size={NewsFeedMetric.StandardIcon}
                strokeWidth={NewsFeedMetric.IconStrokeWidth}
              />
              Read full article at {selected.source}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────
  return (
    <div className={NewsFeedClassName.Root}>
      {/* Filter bar */}
      <div className="shrink-0 flex flex-wrap items-center gap-1 px-2 py-1 border-b border-sig-border/40">
        <Filter
          size={NewsFeedMetric.StandardIcon}
          strokeWidth={NewsFeedMetric.IconStrokeWidth}
          className="text-sig-dim shrink-0"
        />
        <button
          onClick={() => updateSourceFilter(null)}
          className={`touch-target shrink-0 px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors border ${
            sourceFilter === null
              ? NewsFeedClassName.FilterActive
              : NewsFeedClassName.FilterInactive
          }`}
        >
          ALL ({articles.length})
        </button>
        {Object.values(NewsSource).map((src) => {
          const count = sourceCounts[src] ?? 0;
          if (count === 0) return null;
          const active = sourceFilter === src;
          return (
            <button
              key={src}
              onClick={() => updateSourceFilter(active ? null : src)}
              className={`touch-target shrink-0 px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors border ${
                active
                  ? NewsFeedClassName.FilterActive
                  : NewsFeedClassName.FilterInactive
              }`}
            >
              {newsSourceLabel(src)} ({count})
            </button>
          );
        })}
        <div className={NewsFeedClassName.Spacer} />
        <span className="text-sig-dim text-(length:--sig-text-sm) shrink-0">
          {`${filtered.length}`}
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
              <button
                key={article.id}
                type={ButtonType.Button}
                onClick={() => updateSelected(article)}
                className="w-full px-3 py-2 border-b border-sig-border/20 cursor-pointer text-left transition-colors bg-transparent hover:bg-sig-panel/40"
                style={{ height: NewsFeedMetric.RowHeight }}
              >
                {/* Row 1: source + age */}
                <div className="flex items-center gap-2">
                  <Rss
                    size={NewsFeedMetric.CompactIcon}
                    strokeWidth={NewsFeedMetric.IconStrokeWidth}
                    className="text-sig-accent shrink-0"
                  />
                  <span className="text-sig-accent text-(length:--sig-text-sm) font-semibold tracking-wider truncate">
                    {newsSourceLabel(article.source)}
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
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 && articles.length > 0 && (
          <div className="flex items-center justify-center h-full text-sig-dim text-(length:--sig-text-md)">
            No articles match filter
          </div>
        )}
        {filtered.length === 0 && articles.length === 0 && (
          <div className="flex items-center justify-center h-full text-sig-dim text-(length:--sig-text-md)">
            Loading feeds...
          </div>
        )}
      </div>
    </div>
  );
}
