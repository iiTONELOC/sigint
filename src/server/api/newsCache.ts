// ── RSS News Cache ──────────────────────────────────────────────────
// Server-side polling cache for RSS news feeds (CORS bypass).
// Follows gdeltCache/firmsCache contract:
//   startNewsPolling() / stopNewsPolling() / getNewsCache()
// No server-side persistence — memory only, repopulates on restart.

const POLL_INTERVAL_MS = 10 * 60_000; // 10 minutes

// ── Feed sources ────────────────────────────────────────────────────

type FeedSource = { name: string; url: string };

const FEEDS: FeedSource[] = [
  { name: "Reuters via Google", url: "https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&ceid=US:en&hl=en-US&gl=US" },
  { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "The Guardian", url: "https://www.theguardian.com/world/rss" },
  { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml" },
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
  let text = html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  text = text.replace(/<[^>]+>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  return `NW${Math.abs(hash).toString(36)}`;
}

// ── RSS/Atom XML parser ─────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (m?.[1]) {
    const val = m[1].trim();
    const cdata = val.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    return cdata ? cdata[1]!.trim() : val;
  }
  return "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*?${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  return xml.match(re)?.[1] ?? "";
}

function parseRssItems(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = [];
  const isAtom = xml.includes("<feed") && xml.includes("<entry");
  const parts = xml.split(isAtom ? "<entry" : "<item");

  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i]!;
    const title = stripHtml(extractTag(chunk, "title"));
    if (!title) continue;

    let url = isAtom ? extractAttr(chunk, "link", "href") : "";
    if (!url) url = stripHtml(extractTag(chunk, "link"));
    if (!url) continue;

    const dateStr =
      extractTag(chunk, "pubDate") ||
      extractTag(chunk, "published") ||
      extractTag(chunk, "updated");

    let publishedAt: string;
    try {
      publishedAt = dateStr
        ? new Date(dateStr).toISOString()
        : new Date().toISOString();
    } catch {
      publishedAt = new Date().toISOString();
    }

    const description = stripHtml(
      extractTag(chunk, "description") ||
        extractTag(chunk, "summary") ||
        extractTag(chunk, "content"),
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(feed.url, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`📰 ${feed.name}: HTTP ${res.status}`);
      return [];
    }
    return parseRssItems(await res.text(), feed.name);
  } catch (err) {
    console.warn(`📰 ${feed.name}: ${err instanceof Error ? err.message : "Unknown error"}`);
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
let intervalId: ReturnType<typeof setInterval> | null = null;

// ── Poll pipeline ───────────────────────────────────────────────────

async function fetchAllNews(): Promise<void> {
  const errors: string[] = [];
  const allItems: NewsItem[] = [];

  const results = await Promise.allSettled(FEEDS.map((f) => fetchFeed(f)));
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === "fulfilled") allItems.push(...r.value);
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

  console.log(`📰 News: ${capped.length} items from ${FEEDS.length} feeds (${errors.length} errors)`);
}

// ── Public API (matches gdeltCache/firmsCache contract) ─────────────

export function startNewsPolling(): void {
  if (intervalId) return;
  fetchAllNews();
  intervalId = setInterval(fetchAllNews, POLL_INTERVAL_MS);
}

export function stopNewsPolling(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
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
