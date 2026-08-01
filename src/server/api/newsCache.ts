// ── RSS News Cache ──────────────────────────────────────────────────
// Server-side polling cache for RSS news feeds (CORS bypass).
// Follows gdeltCache/firmsCache contract:
//   startNewsPolling() / stopNewsPolling() / getNewsCache()
// No server-side persistence. Memory repopulates on restart.

import { fetchWithTimeout } from "../lib/fetchWithTimeout";
import { createLogger } from "../lib/logger";
import { createPoller } from "../lib/poller";
import { errorMessage } from "../lib/errorMessage";
import { decodeHtmlEntities } from "../lib/htmlEntities";
import { NewsSource } from "@shared/domain/newsSource";

const logger = createLogger({ service: "news" });

const POLL_INTERVAL_MS = 10 * 60_000; // 10 minutes

enum NewsHashPolicy {
  Radix = 36,
}

enum NewsMarkupToken {
  Content = "content",
  Description = "description",
  Entry = "entry",
  Feed = "feed",
  Href = "href",
  Item = "item",
  Link = "link",
  PubDate = "pubDate",
  Published = "published",
  Summary = "summary",
  Title = "title",
  Updated = "updated",
}

enum PromiseResultState {
  Fulfilled = "fulfilled",
}

enum NewsRegexFlag {
  CaseInsensitive = "i",
  DotAll = "s",
}

// ── Feed sources ────────────────────────────────────────────────────

type FeedSource = { name: string; url: string };

const FEEDS: FeedSource[] = [
  { name: NewsSource.Reuters, url: "https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&ceid=US:en&hl=en-US&gl=US" },
  { name: NewsSource.NewYorkTimes, url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { name: NewsSource.Bbc, url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: NewsSource.AlJazeera, url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: NewsSource.Guardian, url: "https://www.theguardian.com/world/rss" },
  { name: NewsSource.Npr, url: "https://feeds.npr.org/1004/rss.xml" },
];

// ── News item shape ─────────────────────────────────────────────────

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description: string;
};

// ── Helpers ─────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  const text = decodeHtmlEntities(html).replace(/<[^<>]*>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0; // NOSONAR: Stable IDs require UTF-16 units and signed 32-bit wrapping.
  }
  return `NW${Math.abs(hash).toString(NewsHashPolicy.Radix)}`;
}

// ── RSS/Atom XML parser ─────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const tagPattern = new RegExp(
    String.raw`<${tag}[^>]*>([\s\S]*?)</${tag}>`,
    NewsRegexFlag.CaseInsensitive,
  );
  const match = tagPattern.exec(xml);
  if (match?.[1]) {
    const value = match[1].trim();
    const cdataPattern = new RegExp(
      String.raw`^<!\[CDATA\[(.*?)\]\]>$`,
      NewsRegexFlag.DotAll,
    );
    const cdataMatch = cdataPattern.exec(value);
    return cdataMatch ? cdataMatch[1]!.trim() : value;
  }
  return "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const attributePattern = new RegExp(
    String.raw`<${tag}[^>]*?${attr}\s*=\s*["']([^"']*)["']`,
    NewsRegexFlag.CaseInsensitive,
  );
  return attributePattern.exec(xml)?.[1] ?? "";
}

function parseRssItems(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = [];
  const isAtom =
    xml.includes(`<${NewsMarkupToken.Feed}`) &&
    xml.includes(`<${NewsMarkupToken.Entry}`);
  const parts = xml.split(
    isAtom ? `<${NewsMarkupToken.Entry}` : `<${NewsMarkupToken.Item}`,
  );

  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i]!;
    const title = stripHtml(extractTag(chunk, NewsMarkupToken.Title));
    if (!title) continue;

    let url = isAtom
      ? extractAttr(chunk, NewsMarkupToken.Link, NewsMarkupToken.Href)
      : "";
    if (!url) url = stripHtml(extractTag(chunk, NewsMarkupToken.Link));
    if (!url) continue;

    const dateStr =
      extractTag(chunk, NewsMarkupToken.PubDate) ||
      extractTag(chunk, NewsMarkupToken.Published) ||
      extractTag(chunk, NewsMarkupToken.Updated);

    let publishedAt: string;
    try {
      publishedAt = dateStr
        ? new Date(dateStr).toISOString()
        : new Date().toISOString();
    } catch {
      publishedAt = new Date().toISOString();
    }

    const description = stripHtml(
      extractTag(chunk, NewsMarkupToken.Description) ||
        extractTag(chunk, NewsMarkupToken.Summary) ||
        extractTag(chunk, NewsMarkupToken.Content),
    ).slice(0, 500);

    items.push({
      id: hashUrl(url),
      title,
      url,
      source: sourceName,
      publishedAt,
      description,
    });
  }
  return items;
}

// ── Fetch single feed ───────────────────────────────────────────────

async function fetchFeed(feed: FeedSource): Promise<NewsItem[]> {
  try {
    const res = await fetchWithTimeout(feed.url, 15_000, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });
    if (!res.ok) {
      logger.warn(`📰 ${feed.name}: HTTP ${res.status}`);
      return [];
    }
    return parseRssItems(await res.text(), feed.name);
  } catch (err) {
    logger.warn(`📰 ${feed.name}: ${errorMessage(err, "Unknown error")}`);
    return [];
  }
}

// ── Cache state ─────────────────────────────────────────────────────

type NewsCache = {
  items: NewsItem[];
  fetchedAt: number;
  itemCount: number;
  error: string | null;
};

let cache: NewsCache = { items: [], fetchedAt: 0, itemCount: 0, error: null };

// ── Poll pipeline ───────────────────────────────────────────────────

async function fetchAllNews(): Promise<void> {
  const errors: string[] = [];
  const allItems: NewsItem[] = [];

  const results = await Promise.allSettled(FEEDS.map((f) => fetchFeed(f)));
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === PromiseResultState.Fulfilled) allItems.push(...r.value);
    else errors.push(`${FEEDS[i]!.name}: ${r.reason}`);
  }

  // Dedup by URL
  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const item of allItems) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
  }

  // Sort newest first, cap at 200
  deduped.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const capped = deduped.slice(0, 200);

  // Retain stale cache if upstream returned 0 items
  if (capped.length > 0 || cache.items.length === 0) {
    cache = {
      items: capped,
      fetchedAt: Date.now(),
      itemCount: capped.length,
      error: errors.length > 0 ? errors.join("; ") : null,
    };
  } else if (errors.length > 0) {
    cache = { ...cache, error: errors.join("; ") };
  }

  logger.info(`📰 News: ${capped.length} items from ${FEEDS.length} feeds (${errors.length} errors)`);
}

// ── Public API (matches gdeltCache/firmsCache contract) ─────────────

const poller = createPoller(fetchAllNews, POLL_INTERVAL_MS);

export function startNewsPolling(): void {
  poller.start();
}

export function stopNewsPolling(): void {
  poller.stop();
}

export function getNewsCache(): {
  items: NewsItem[];
  fetchedAt: number;
  itemCount: number;
  error: string | null;
} {
  return {
    items: cache.items,
    fetchedAt: cache.fetchedAt,
    itemCount: cache.itemCount,
    error: cache.error,
  };
}

/** TEST-ONLY: reset module state to the initial empty shape. */
export function __resetNewsCacheForTests(): void {
  cache = { items: [], fetchedAt: 0, itemCount: 0, error: null };
}
