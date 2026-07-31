import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SourceStatus } from "@shared/domain/sourceStatus";
import { renderHook } from "../hookHelper";

// ── useNewsData ─────────────────────────────────────────────────────

describe("useNewsData", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("starts empty and loads data", async () => {
    const mockArticles = [
      {
        id: "n1",
        title: "Test",
        url: "https://example.com",
        source: "BBC",
        publishedAt: new Date().toISOString(),
        description: "desc",
      },
    ];

    // @ts-ignore
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
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: mockArticles }),
        } as unknown as Response;
      }
      throw new Error(`Unmocked: ${url}`);
    };

    const { useNewsData } = await import("@/features/news");
    const { newsProvider } = await import("@/features/news");
    const { result, waitFor } = renderHook(() => useNewsData());

    // Simulate boot: refresh + notify
    await newsProvider.refresh().catch(() => {});
    (newsProvider as any)._onChange?.();

    await waitFor(() => result.current.loading === false);
    expect(result.current.data.length).toBeGreaterThan(0);
    expect(result.current.dataSource).toBe(SourceStatus.Live);
  });
});

