import { fetchWithTimeout } from "../lib/fetchWithTimeout";
import { createLogger } from "../lib/logger";
import { createPoller } from "../lib/poller";
import { errorMessage } from "../lib/errorMessage";
import { decodeHtmlEntities } from "../lib/htmlEntities";
import { NewsPolling, NewsSource } from "@shared/domain/newsSource";

const logger = createLogger({ service: "news" });

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

const FEED_URL_BY_SOURCE: Readonly<Record<NewsSource, string>> = {
  [NewsSource.Reuters]: "https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&ceid=US:en&hl=en-US&gl=US",
  [NewsSource.NewYorkTimes]: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  [NewsSource.Bbc]: "https://feeds.bbci.co.uk/news/world/rss.xml",
  [NewsSource.AlJazeera]: "https://www.aljazeera.com/xml/rss/all.xml",
  [NewsSource.Guardian]: "https://www.theguardian.com/world/rss",
  [NewsSource.Npr]: "https://feeds.npr.org/1004/rss.xml",
};

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description: string;
};

function stripHtml(html: string): string {
  const text = decodeHtmlEntities(html).replace(/<[^<>]*>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  return `NW${Math.abs(hash).toString(NewsHashPolicy.Radix)}`;
}

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

async function fetchFeed(
  source: string,
  url: string,
): Promise<NewsItem[]> {
  try {
    const res = await fetchWithTimeout(url, 15_000, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });
    if (!res.ok) {
      logger.warn(`📰 ${source}: HTTP ${res.status}`);
      return [];
    }
    return parseRssItems(await res.text(), source);
  } catch (err) {
    logger.warn(`📰 ${source}: ${errorMessage(err, "Unknown error")}`);
    return [];
  }
}

type NewsCache = {
  items: NewsItem[];
  fetchedAt: number;
  itemCount: number;
  error: string | null;
};

let cache: NewsCache = { items: [], fetchedAt: 0, itemCount: 0, error: null };

async function fetchAllNews(): Promise<void> {
  const errors: string[] = [];
  const allItems: NewsItem[] = [];

  const feeds = Object.entries(FEED_URL_BY_SOURCE);
  const results = await Promise.allSettled(
    feeds.map(([source, url]) => fetchFeed(source, url)),
  );
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === PromiseResultState.Fulfilled) allItems.push(...r.value);
    else errors.push(`${feeds[i]![0]}: ${r.reason}`);
  }

  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const item of allItems) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
  }

  deduped.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const capped = deduped.slice(0, 200);

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

  logger.info(`📰 News: ${capped.length} items from ${feeds.length} feeds (${errors.length} errors)`);
}

const poller = createPoller(fetchAllNews, NewsPolling.IntervalMs);

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
