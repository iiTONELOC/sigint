import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "bun:test";
import {
  normalizeCyclonesPayload,
  getCyclonesCache,
  resolveCyclonesFixtureOverride,
  shouldFetchCyclones,
  buildFetchHeaders,
  extractConditionalHeaders,
  computeAdvisoryHash,
  fetchCyclones,
  __resetCyclonesCacheForTests,
  NHC_URL,
  USER_AGENT,
  POLL_INTERVAL_MS,
} from "../../../src/server/api/cyclonesCache";

// ── Pure validator: shape of an NHC CurrentStorms.json response ────

describe("normalizeCyclonesPayload", () => {
  test("accepts the documented shape", () => {
    const out = normalizeCyclonesPayload({
      activeStorms: [{ id: "al052026", name: "STORM_TEST_C5" }],
    });
    expect(out).not.toBeNull();
    expect(out?.activeStorms.length).toBe(1);
  });

  test("accepts an empty activeStorms array (out-of-season is the truth)", () => {
    const out = normalizeCyclonesPayload({ activeStorms: [] });
    expect(out).not.toBeNull();
    expect(out?.activeStorms).toEqual([]);
  });

  test("rejects payloads where activeStorms is missing", () => {
    expect(normalizeCyclonesPayload({})).toBeNull();
  });

  test("rejects payloads where activeStorms is not an array", () => {
    expect(normalizeCyclonesPayload({ activeStorms: "nope" })).toBeNull();
    expect(normalizeCyclonesPayload({ activeStorms: 42 })).toBeNull();
    expect(
      normalizeCyclonesPayload({ activeStorms: { foo: "bar" } }),
    ).toBeNull();
  });

  test("rejects non-object payloads", () => {
    expect(normalizeCyclonesPayload(null)).toBeNull();
    expect(normalizeCyclonesPayload(undefined)).toBeNull();
    expect(normalizeCyclonesPayload("string")).toBeNull();
    expect(normalizeCyclonesPayload(123)).toBeNull();
    expect(normalizeCyclonesPayload([])).toBeNull();
  });

  test("preserves extra fields by ignoring them (server passes through what it needs)", () => {
    const out = normalizeCyclonesPayload({
      activeStorms: [{ id: "al01" }],
      _comment: "synthetic",
      extra: "ignored",
    });
    expect(out?.activeStorms.length).toBe(1);
  });
});

// ── Module-level cache + constants ─────────────────────────────────

describe("cyclonesCache module surface", () => {
  test("getCyclonesCache returns initial empty shape before any fetch", () => {
    const c = getCyclonesCache();
    expect(c.body).toBeNull();
    expect(c.fetchedAt).toBe(0);
    expect(c.stormCount).toBe(0);
    expect(c.error).toBeNull();
  });

  test("NHC_URL is the hardcoded official endpoint (A10 SSRF guard)", () => {
    expect(NHC_URL).toBe("https://www.nhc.noaa.gov/CurrentStorms.json");
  });

  test("USER_AGENT identifies the project per NOAA convention", () => {
    expect(USER_AGENT).toContain("sigint");
    expect(USER_AGENT).toContain("github.com/iitoneloc/sigint");
  });

  test("poll interval is 30 minutes (matches client maxCacheAgeMs ≤ pollInterval invariant)", () => {
    expect(POLL_INTERVAL_MS).toBe(30 * 60_000);
  });
});

// ── Fixture-driven validation (test-only fixture system) ──────────

describe("normalizeCyclonesPayload — accepts the v1.0 fixture set", () => {
  const FIXTURES = [
    "empty-out-of-season.json",
    "tropical-depression.json",
    "subtropical-example.json",
    "single-cat3.json",
    "single-cat5.json",
    "multi-storm.json",
  ];

  for (const name of FIXTURES) {
    test(`tests/fixtures/cyclones/${name} normalizes successfully`, async () => {
      const fixture = await Bun.file(`tests/fixtures/cyclones/${name}`).json();
      const out = normalizeCyclonesPayload(fixture);
      expect(out).not.toBeNull();
      expect(Array.isArray(out?.activeStorms)).toBe(true);
    });
  }
});

// ── CYCLONES_FIXTURE dev-only override ────────────────────────────
// Pure helper — no I/O on the live network, no mutation of module
// state. The helper is consumed at the top of fetchCyclones() to
// short-circuit the live NHC fetch in development. Behavior is keyed
// off env vars passed in directly so the tests don't fight process.env.

describe("resolveCyclonesFixtureOverride", () => {
  test("returns null in dev when CYCLONES_FIXTURE is unset", async () => {
    expect(
      await resolveCyclonesFixtureOverride({ NODE_ENV: "development" }),
    ).toBeNull();
  });

  test("returns null in production even when CYCLONES_FIXTURE is set", async () => {
    expect(
      await resolveCyclonesFixtureOverride({
        NODE_ENV: "production",
        CYCLONES_FIXTURE: "single-cat5",
      }),
    ).toBeNull();
  });

  test("loads the fixture in dev when CYCLONES_FIXTURE matches a real label", async () => {
    const result = await resolveCyclonesFixtureOverride({
      NODE_ENV: "development",
      CYCLONES_FIXTURE: "single-cat5",
    });
    expect(result).not.toBeNull();
    const body = result?.body as { activeStorms?: unknown[] } | undefined;
    expect(Array.isArray(body?.activeStorms)).toBe(true);
    expect(body?.activeStorms?.length).toBe(1);
  });

  test("rejects path-traversal labels (OWASP A01)", async () => {
    await expect(
      resolveCyclonesFixtureOverride({
        NODE_ENV: "development",
        CYCLONES_FIXTURE: "../../../etc/passwd",
      }),
    ).rejects.toThrow(/Invalid CYCLONES_FIXTURE/);
  });

  test("rejects shell-special and uppercase characters via regex allowlist", async () => {
    for (const bad of ["foo;bar", "foo$bar", "foo bar", "FOO", "../foo"]) {
      await expect(
        resolveCyclonesFixtureOverride({
          NODE_ENV: "development",
          CYCLONES_FIXTURE: bad,
        }),
      ).rejects.toThrow(/Invalid CYCLONES_FIXTURE/);
    }
  });

  test("throws fixture-not-found when the label is well-formed but the file is missing", async () => {
    await expect(
      resolveCyclonesFixtureOverride({
        NODE_ENV: "development",
        CYCLONES_FIXTURE: "totally-nonexistent-fixture",
      }),
    ).rejects.toThrow(/Fixture not found/);
  });
});

// ── shouldFetchCyclones — season + cache continuity gate ──────────
// Decides at every poll tick whether to issue the NHC GET. Skip rule:
// out-of-season AND the cache is empty (no continuity to preserve).
// Continuity rule: any non-empty cache always re-fetches so the
// snapshot doesn't freeze when a storm dissipates at the season edge.

describe("shouldFetchCyclones — season + cache gate", () => {
  // UTC dates so dyno/laptop TZ skew can't drift the boundary.
  const utc = (year: number, month: number, day: number): Date =>
    new Date(Date.UTC(year, month - 1, day));

  // ACTIVE_BASINS = ["AL","EP","CP"], all sharing the May 15 – Dec 15
  // Northern-Hemi window. Pick representative dates for in/out.
  const inSeason = utc(2026, 8, 15); // peak Atlantic
  const outOfSeason = utc(2026, 2, 1); // mid-winter, all NH basins shut

  test("out of season + empty cache → skip (no fetch)", () => {
    expect(shouldFetchCyclones(0, outOfSeason)).toBe(false);
  });

  test("out of season + non-empty cache → fetch (continuity)", () => {
    expect(shouldFetchCyclones(1, outOfSeason)).toBe(true);
    expect(shouldFetchCyclones(5, outOfSeason)).toBe(true);
  });

  test("in season + empty cache → fetch (storm could appear any moment)", () => {
    expect(shouldFetchCyclones(0, inSeason)).toBe(true);
  });

  test("in season + non-empty cache → fetch", () => {
    expect(shouldFetchCyclones(3, inSeason)).toBe(true);
  });

  test("season boundary (May 15) → fetch even with empty cache", () => {
    expect(shouldFetchCyclones(0, utc(2026, 5, 15))).toBe(true);
  });

  test("one day before season (May 14) → skip when empty", () => {
    expect(shouldFetchCyclones(0, utc(2026, 5, 14))).toBe(false);
  });

  test("season boundary (Dec 15) → fetch even with empty cache", () => {
    expect(shouldFetchCyclones(0, utc(2026, 12, 15))).toBe(true);
  });

  test("one day after season (Dec 16) → skip when empty", () => {
    expect(shouldFetchCyclones(0, utc(2026, 12, 16))).toBe(false);
  });

  test("default `now` (no second arg) is the live wall clock", () => {
    // A non-empty cache always fetches regardless of the date arg, so
    // this test only verifies the parameter is optional without
    // tripping a TypeError. The continuity branch dominates.
    expect(shouldFetchCyclones(1)).toBe(true);
  });
});

// ── Pure HTTP-cache helpers ───────────────────────────────────────

describe("buildFetchHeaders", () => {
  test("first request — no validators carry the base UA + Accept only", () => {
    const headers = buildFetchHeaders({ lastModified: null, etag: null });
    expect(headers["User-Agent"]).toBe(USER_AGENT);
    expect(headers["Accept"]).toBe("application/json");
    expect(headers["If-Modified-Since"]).toBeUndefined();
    expect(headers["If-None-Match"]).toBeUndefined();
  });

  test("Last-Modified state → If-Modified-Since header set on next request", () => {
    const lm = "Fri, 31 Oct 2025 23:16:00 GMT";
    const headers = buildFetchHeaders({ lastModified: lm, etag: null });
    expect(headers["If-Modified-Since"]).toBe(lm);
    expect(headers["If-None-Match"]).toBeUndefined();
  });

  test("ETag state → If-None-Match header set on next request", () => {
    const etag = '"abc123"';
    const headers = buildFetchHeaders({ lastModified: null, etag });
    expect(headers["If-None-Match"]).toBe(etag);
    expect(headers["If-Modified-Since"]).toBeUndefined();
  });

  test("both validators present → both headers sent", () => {
    const lm = "Fri, 31 Oct 2025 23:16:00 GMT";
    const etag = '"abc123"';
    const headers = buildFetchHeaders({ lastModified: lm, etag });
    expect(headers["If-Modified-Since"]).toBe(lm);
    expect(headers["If-None-Match"]).toBe(etag);
  });
});

describe("extractConditionalHeaders", () => {
  test("captures Last-Modified and ETag from a 200 response", () => {
    const res = new Response("{}", {
      status: 200,
      headers: {
        "last-modified": "Fri, 31 Oct 2025 23:16:00 GMT",
        etag: '"v1-abc"',
        "content-type": "application/json",
      },
    });
    expect(extractConditionalHeaders(res)).toEqual({
      lastModified: "Fri, 31 Oct 2025 23:16:00 GMT",
      etag: '"v1-abc"',
    });
  });

  test("returns nulls when the origin omits both validators", () => {
    const res = new Response("{}", { status: 200 });
    expect(extractConditionalHeaders(res)).toEqual({
      lastModified: null,
      etag: null,
    });
  });

  test("captures whichever validator the origin happens to send", () => {
    // NHC's CDN sometimes returns Last-Modified without ETag (cold
    // cache). The helper must round-trip just the one that was sent.
    const res = new Response("{}", {
      status: 200,
      headers: { "last-modified": "Sat, 01 Jan 2026 00:00:00 GMT" },
    });
    expect(extractConditionalHeaders(res)).toEqual({
      lastModified: "Sat, 01 Jan 2026 00:00:00 GMT",
      etag: null,
    });
  });
});

// ── Full fetchCyclones HTTP loop with mocked global fetch ─────────
// Drives a sequence of canned Response objects through fetchCyclones
// and asserts (a) the request headers carry the right validators on
// each tick, and (b) the cache transitions correctly on 200/304.

describe("fetchCyclones — conditional-fetch round-trip", () => {
  // All sequence tests use an in-season date so the Part 2 season
  // gate doesn't pre-empt the conditional-fetch loop. ACTIVE_BASINS
  // = AL/EP/CP all share the May 15 – Dec 15 window; mid-August is
  // squarely inside it.
  const IN_SEASON = new Date(Date.UTC(2026, 7, 15));
  type FetchCall = { url: string; headers: Record<string, string> };
  let originalFetch: typeof fetch;
  let calls: FetchCall[] = [];
  let queue: Response[] = [];

  /** Coerce Playwright/Node's HeadersInit to a plain Record so test
   *  assertions don't have to special-case the three representations. */
  function flattenHeaders(init: RequestInit | undefined): Record<string, string> {
    const headers: Record<string, string> = {};
    const initHeaders = init?.headers;
    if (!initHeaders) return headers;
    if (initHeaders instanceof Headers) {
      initHeaders.forEach((v, k) => {
        headers[k] = v;
      });
    } else if (Array.isArray(initHeaders)) {
      for (const [k, v] of initHeaders) headers[k] = v;
    } else {
      Object.assign(headers, initHeaders);
    }
    return headers;
  }

  function urlOf(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input.url;
  }

  beforeEach(() => {
    __resetCyclonesCacheForTests();
    calls = [];
    queue = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      calls.push({ url: urlOf(input), headers: flattenHeaders(init) });
      const next = queue.shift();
      if (!next) {
        throw new Error("test: ran out of queued fetch responses");
      }
      return next;
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    __resetCyclonesCacheForTests();
  });

  /** Build a 200 response with a JSON body and optional validators. */
  function mk200(
    body: unknown,
    headers: Record<string, string> = {},
  ): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json", ...headers },
    });
  }

  test("first 200 stores Last-Modified — next fetch sends If-Modified-Since", async () => {
    queue.push(
      mk200(
        { activeStorms: [] },
        { "last-modified": "Fri, 31 Oct 2025 23:16:00 GMT" },
      ),
      mk200({ activeStorms: [] }),
    );

    await fetchCyclones(IN_SEASON);
    expect(calls.at(0)?.headers["If-Modified-Since"]).toBeUndefined();

    await fetchCyclones(IN_SEASON);
    expect(calls.at(1)?.headers["If-Modified-Since"]).toBe(
      "Fri, 31 Oct 2025 23:16:00 GMT",
    );
  });

  test("first 200 stores ETag — next fetch sends If-None-Match", async () => {
    queue.push(
      mk200({ activeStorms: [] }, { etag: '"v1-abc"' }),
      mk200({ activeStorms: [] }),
    );

    await fetchCyclones(IN_SEASON);
    expect(calls.at(0)?.headers["If-None-Match"]).toBeUndefined();

    await fetchCyclones(IN_SEASON);
    expect(calls.at(1)?.headers["If-None-Match"]).toBe('"v1-abc"');
  });

  test("304 keeps cache.body, bumps fetchedAt, runs no parse", async () => {
    // First populate the cache with a real body + headers.
    queue.push(
      mk200(
        {
          activeStorms: [
            { id: "AL012025", name: "TEST", classification: "TS" },
          ],
        },
        { "last-modified": "Sat, 01 Nov 2025 00:00:00 GMT" },
      ),
    );
    await fetchCyclones(IN_SEASON);
    const afterFirst = getCyclonesCache();
    expect(afterFirst.stormCount).toBe(1);
    const firstFetchedAt = afterFirst.fetchedAt;
    expect(firstFetchedAt).toBeGreaterThan(0);

    // Now respond 304 — payload IS unchanged.
    queue.push(new Response(null, { status: 304 }));
    // Give wall clock a chance to advance so fetchedAt updates visibly.
    await new Promise((r) => setTimeout(r, 5));
    await fetchCyclones(IN_SEASON);

    const afterSecond = getCyclonesCache();
    // body must be the same reference (no parse, no replacement).
    expect(afterSecond.body).toBe(afterFirst.body);
    expect(afterSecond.stormCount).toBe(1);
    expect(afterSecond.error).toBeNull();
    expect(afterSecond.fetchedAt).toBeGreaterThan(firstFetchedAt);
  });

  test("200 → 304 → 200 sequence — third 200 replaces body and updates headers", async () => {
    queue.push(
      mk200(
        { activeStorms: [{ id: "AL012025", classification: "TS" }] },
        { etag: '"v1"' },
      ),
      new Response(null, { status: 304 }),
      mk200(
        {
          activeStorms: [
            { id: "AL012025", classification: "TS" },
            { id: "AL022025", classification: "TD" },
          ],
        },
        { etag: '"v2"' },
      ),
    );

    await fetchCyclones(IN_SEASON);
    expect(getCyclonesCache().stormCount).toBe(1);

    await fetchCyclones(IN_SEASON);
    expect(calls.at(1)?.headers["If-None-Match"]).toBe('"v1"');
    expect(getCyclonesCache().stormCount).toBe(1); // 304 kept body

    await fetchCyclones(IN_SEASON);
    expect(calls.at(2)?.headers["If-None-Match"]).toBe('"v1"');
    expect(getCyclonesCache().stormCount).toBe(2); // 200 replaced body

    // After the second 200, conditional state advances to v2.
    queue.push(new Response(null, { status: 304 }));
    await fetchCyclones(IN_SEASON);
    expect(calls.at(3)?.headers["If-None-Match"]).toBe('"v2"');
  });

  test("304 after a warm-up 200 leaves stormCount and clears any prior error", async () => {
    // The strict empty-cache 304 path doesn't happen in production
    // (the season gate skips the fetch entirely when cache is empty
    // out of season), so this case verifies the handler is still
    // defensive after a warm-up 200 → 304 transition.
    queue.push(
      mk200({ activeStorms: [{}] }),
      new Response(null, { status: 304 }),
    );

    await fetchCyclones(IN_SEASON);
    expect(getCyclonesCache().stormCount).toBe(1);
    await fetchCyclones(IN_SEASON);
    const c = getCyclonesCache();
    expect(c.stormCount).toBe(1); // 304 left it
    expect(c.error).toBeNull();
  });

  // ── Advisory-number dedup ────────────────────────────────────────
  // After a successful 200, the (id, advisoryNumber) tuple is hashed
  // and compared against the previous fetch's hash. Match → keep
  // body reference, just bump fetchedAt. Different → full update.

  test("two 200s with identical advisories — second fetch keeps cache.body reference", async () => {
    const sameBody = {
      activeStorms: [
        {
          id: "AL012025",
          name: "TEST",
          forecastTrack: { advisoryNumber: 7 },
        },
      ],
    };
    queue.push(mk200(sameBody), mk200(sameBody));

    await fetchCyclones(IN_SEASON);
    const first = getCyclonesCache();
    expect(first.stormCount).toBe(1);
    const firstFetchedAt = first.fetchedAt;

    await new Promise((r) => setTimeout(r, 5));
    await fetchCyclones(IN_SEASON);
    const second = getCyclonesCache();
    // Same body reference → consumers comparing by reference see no change.
    expect(second.body).toBe(first.body);
    expect(second.stormCount).toBe(1);
    // fetchedAt still advances — cache is "fresh" even when contents are identical.
    expect(second.fetchedAt).toBeGreaterThan(firstFetchedAt);
    expect(second.error).toBeNull();
  });

  test("two 200s with different advisory numbers — second triggers full update", async () => {
    queue.push(
      mk200({
        activeStorms: [
          { id: "AL012025", forecastTrack: { advisoryNumber: 7 } },
        ],
      }),
      mk200({
        activeStorms: [
          { id: "AL012025", forecastTrack: { advisoryNumber: 8 } },
        ],
      }),
    );

    await fetchCyclones(IN_SEASON);
    const first = getCyclonesCache();

    await fetchCyclones(IN_SEASON);
    const second = getCyclonesCache();
    // Different advisory → body reference replaced.
    expect(second.body).not.toBe(first.body);
    expect(second.stormCount).toBe(1);
  });

  test("new storm appearing — different storm set triggers update", async () => {
    queue.push(
      mk200({
        activeStorms: [
          { id: "AL012025", forecastTrack: { advisoryNumber: 7 } },
        ],
      }),
      mk200({
        activeStorms: [
          { id: "AL012025", forecastTrack: { advisoryNumber: 7 } },
          { id: "AL022025", forecastTrack: { advisoryNumber: 1 } },
        ],
      }),
    );

    await fetchCyclones(IN_SEASON);
    expect(getCyclonesCache().stormCount).toBe(1);
    await fetchCyclones(IN_SEASON);
    expect(getCyclonesCache().stormCount).toBe(2);
  });

  test("dedup is order-independent — payload re-ordered but same advisories", async () => {
    queue.push(
      mk200({
        activeStorms: [
          { id: "AL012025", forecastTrack: { advisoryNumber: 7 } },
          { id: "AL022025", forecastTrack: { advisoryNumber: 3 } },
        ],
      }),
      mk200({
        activeStorms: [
          // Same set, swapped order.
          { id: "AL022025", forecastTrack: { advisoryNumber: 3 } },
          { id: "AL012025", forecastTrack: { advisoryNumber: 7 } },
        ],
      }),
    );

    await fetchCyclones(IN_SEASON);
    const first = getCyclonesCache();
    await fetchCyclones(IN_SEASON);
    const second = getCyclonesCache();
    // Same content (reordered) → dedup keeps body reference.
    expect(second.body).toBe(first.body);
  });
});

// ── computeAdvisoryHash — pure helper unit tests ─────────────────

describe("computeAdvisoryHash", () => {
  test("empty list → stable empty-array hash", () => {
    expect(computeAdvisoryHash([])).toBe("[]");
  });

  test("single storm with advisoryNumber → stable single-entry hash", () => {
    const out = computeAdvisoryHash([
      { id: "AL012025", forecastTrack: { advisoryNumber: 7 } },
    ]);
    expect(out).toBe(JSON.stringify([{ id: "AL012025", advisoryNumber: 7 }]));
  });

  test("missing advisoryNumber → null in the signature", () => {
    const out = computeAdvisoryHash([{ id: "AL012025" }]);
    expect(out).toBe(
      JSON.stringify([{ id: "AL012025", advisoryNumber: null }]),
    );
  });

  test("storms without an id are skipped (defensive)", () => {
    const out = computeAdvisoryHash([
      { id: "AL012025", forecastTrack: { advisoryNumber: 1 } },
      { name: "no-id storm" }, // dropped
      { id: "" }, // empty id, dropped
    ]);
    expect(out).toContain("AL012025");
    expect(out).not.toContain("no-id");
  });

  test("non-object entries skipped without throwing", () => {
    const out = computeAdvisoryHash([null, 42, "string", undefined]);
    expect(out).toBe("[]");
  });

  test("payload re-order produces the same hash (sort-by-id)", () => {
    const a = computeAdvisoryHash([
      { id: "B", forecastTrack: { advisoryNumber: 1 } },
      { id: "A", forecastTrack: { advisoryNumber: 2 } },
    ]);
    const b = computeAdvisoryHash([
      { id: "A", forecastTrack: { advisoryNumber: 2 } },
      { id: "B", forecastTrack: { advisoryNumber: 1 } },
    ]);
    expect(a).toBe(b);
  });

  test("different advisoryNumber on the same id → different hash", () => {
    const a = computeAdvisoryHash([
      { id: "AL012025", forecastTrack: { advisoryNumber: 7 } },
    ]);
    const b = computeAdvisoryHash([
      { id: "AL012025", forecastTrack: { advisoryNumber: 8 } },
    ]);
    expect(a).not.toBe(b);
  });

  test("string and number advisoryNumbers are kept verbatim (NHC sends both)", () => {
    const numeric = computeAdvisoryHash([
      { id: "AL012025", forecastTrack: { advisoryNumber: 7 } },
    ]);
    const stringy = computeAdvisoryHash([
      { id: "AL012025", forecastTrack: { advisoryNumber: "7" } },
    ]);
    // Different JSON encodings — surfaces an upstream type change as
    // a real diff so the dedup doesn't silently swallow it.
    expect(numeric).not.toBe(stringy);
  });
});
