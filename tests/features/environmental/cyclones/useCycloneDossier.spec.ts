/// <reference lib="dom" />
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "bun:test";
import { renderHook } from "../../../hookHelper";
import { useCycloneDossier } from "@/features/environmental/cyclones/hooks/useCycloneDossier";
import { cacheClearAll } from "@/lib/storageService";

// Each test uses a distinct stormId so the per-test IDB cache entries
// don't collide. The hook fires an async cacheSet on success that may
// land AFTER the next test's cacheClearAll, which would race a stale
// entry into the next test's fast path.
const STORM_ID = "AL142024";
const STORM_ID_500 = "AL992024";
const STORM_ID_NULL = "AL882024";
const DOSSIER_URL = `/api/dossier/cyclone/${STORM_ID}`;

const SAMPLE_BUNDLE = {
  stormId: STORM_ID,
  advisory: {
    advisoryNumber: "13",
    issuedAt: "400 AM CDT Tue Oct 08 2024",
    body: "...EXTREMELY POWERFUL HURRICANE MILTON...",
  },
  discussion: {
    advisoryNumber: "13",
    issuedAt: "400 AM CDT Tue Oct 08 2024",
    body: "Air Force Hurricane Hunters and NOAA aircraft...",
  },
};

describe("useCycloneDossier", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCount: number;
  let lastUrl: string;
  let serverResponse: unknown;
  let serverStatus: number;

  beforeEach(async () => {
    await cacheClearAll();
    originalFetch = globalThis.fetch;
    fetchCount = 0;
    lastUrl = "";
    serverResponse = { dossier: SAMPLE_BUNDLE, fetchedAt: Date.now() };
    serverStatus = 200;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/api/auth/token")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      lastUrl = url;
      fetchCount++;
      return new Response(JSON.stringify(serverResponse), {
        status: serverStatus,
        headers: { "content-type": "application/json" },
      });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetches dossier from /api/dossier/cyclone/:stormId on mount", async () => {
    const { result, waitFor, unmount } = renderHook(() =>
      useCycloneDossier(STORM_ID),
    );
    await waitFor(() => result.current.dossier !== null);
    expect(result.current.dossier?.stormId).toBe(STORM_ID);
    expect(result.current.dossier?.advisory?.advisoryNumber).toBe("13");
    expect(result.current.loading).toBe(false);
    expect(lastUrl).toContain(DOSSIER_URL);
    unmount();
  });

  test("returns null and skips fetch when stormId is null", async () => {
    const { result, unmount } = renderHook(() =>
      useCycloneDossier(null),
    );
    // No async wait — null branch is synchronous.
    expect(result.current.dossier).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(fetchCount).toBe(0);
    unmount();
  });

  test("rejects malformed stormId without hitting the network", async () => {
    const { result, unmount } = renderHook(() =>
      useCycloneDossier("BOGUS-ID"),
    );
    expect(result.current.dossier).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(fetchCount).toBe(0);
    unmount();
  });

  test("server 500 → falls back to error state, dossier null", async () => {
    serverStatus = 500;
    const { result, waitFor, unmount } = renderHook(() =>
      useCycloneDossier(STORM_ID_500),
    );
    await waitFor(() => result.current.error !== null);
    expect(result.current.error).not.toBeNull();
    expect(result.current.dossier).toBeNull();
    expect(result.current.loading).toBe(false);
    unmount();
  });
});
