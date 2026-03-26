import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { newsProvider, type NewsArticle } from "@/features/news";

// ── Mock data ───────────────────────────────────────────────────────

const MOCK_ARTICLES: NewsArticle[] = [
  {
    id: "n1",
    title: "Test Article One",
    url: "https://example.com/1",
    source: "Reuters",
    publishedAt: new Date().toISOString(),
    description: "First test article",
  },
  {
    id: "n2",
    title: "Test Article Two",
    url: "https://example.com/2",
    source: "BBC",
    publishedAt: new Date().toISOString(),
    description: "Second test article",
  },
];

// ── Fetch mock — handles auth cookie endpoint + news endpoint ───────

let originalFetch: typeof globalThis.fetch;
let newsResponse: { ok: boolean; items?: NewsArticle[]; error?: boolean };

function mockFetch() {
  //@ts-ignore
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/api/auth/token")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as unknown as Response;
    }

    if (url.includes("/api/news/latest")) {
      if (newsResponse.error) {
        throw new Error("Network error");
      }
      return {
        ok: newsResponse.ok,
        status: newsResponse.ok ? 200 : 503,
        json: async () => ({ items: newsResponse.items ?? [] }),
      } as unknown as Response;
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  newsResponse = { ok: true, items: MOCK_ARTICLES };
  mockFetch();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Tests ───────────────────────────────────────────────────────────

describe("newsProvider.refresh()", () => {
  test("fetches articles from news endpoint", async () => {
    const result = await newsProvider.refresh();
    expect(result.length).toBe(2);
    expect(result[0]!.id).toBe("n1");
    expect(result[0]!.title).toBe("Test Article One");
    expect(result[0]!.source).toBe("Reuters");
  });

  test("returns cached data on non-ok response", async () => {
    newsResponse = { ok: true, items: MOCK_ARTICLES };
    await newsProvider.refresh();

    newsResponse = { ok: false };
    const result = await newsProvider.refresh();

    expect(result.length).toBe(2);
    const snap = newsProvider.getSnapshot();
    expect(snap.error).not.toBeNull();
  });

  test("sets error on fetch failure", async () => {
    newsResponse = { ok: true, error: true };
    await newsProvider.refresh();
    const snap = newsProvider.getSnapshot();
    expect(snap.error).not.toBeNull();
  });
});

describe("newsProvider.getData()", () => {
  test("returns data without re-fetching when cached", async () => {
    let fetchCount = 0;
    const origMock = globalThis.fetch;
    //@ts-ignore
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/news/latest")) fetchCount++;
      return origMock(input, init);
    };

    await newsProvider.refresh();
    fetchCount = 0;

    const result = await newsProvider.getData(600_000);
    expect(result.length).toBe(2);
    expect(fetchCount).toBe(0);
  });
});

describe("newsProvider.getSnapshot()", () => {
  test("snapshot reflects fetched data", async () => {
    await newsProvider.refresh();
    const snap = newsProvider.getSnapshot();
    expect(snap.items.length).toBe(2);
    expect(snap.error).toBeNull();
    expect(snap.loading).toBe(false);
    expect(snap.lastUpdatedAt).not.toBeNull();
  });
});

describe("NewsArticle shape", () => {
  test("articles have required fields", async () => {
    const result = await newsProvider.refresh();
    const article = result[0]!;
    expect(typeof article.id).toBe("string");
    expect(typeof article.title).toBe("string");
    expect(typeof article.url).toBe("string");
    expect(typeof article.source).toBe("string");
    expect(typeof article.publishedAt).toBe("string");
    expect(typeof article.description).toBe("string");
  });
});
