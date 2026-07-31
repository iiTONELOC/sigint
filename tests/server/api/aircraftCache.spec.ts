import { SourceCompleteness, SourceErrorCode, SourceFreshness, SourcePhase, type SourceId } from "@shared/source";
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "bun:test";
import {
  AIRCRAFT_TILES,
  ADSB_BASE_URL,
  AircraftSourcePolicy,
  TILE_RADIUS_NM,
  dedupByHex,
  normalizeAdsbPayload,
  parseRetryAfter,
  fetchTileWithRetry,
  sweepTiles,
  resolveAircraftFixtureOverride,
  getAircraftCache,
  createSweepState,
  ingestTile,
  finalizeSweep,
  runAircraftAcquisition,
  runSweep,
  __resetAircraftCacheForTests,
  type SweepState,
  type AircraftTileResult,
} from "../../../src/server/api/aircraftCache";
import { isRecord } from "../../../src/shared/geo";

// ── Tile coverage ──────────────────────────────────────────────────

describe("AIRCRAFT_TILES", () => {
  test("ships exactly 108 tiles (post tile-coverage audit — see commit body)", () => {
    // Audit dropped 6 structurally-dead tiles (Ukraine war zone,
    // Iraq/Iran restricted airspace, Chinese ADS-B publishing
    // restrictions in 3 Beijing-region tiles) and added 1 (Hawaii,
    // previously uncovered Pacific hub). Net: 113 → 108. See
    // scripts/probe-aircraft-tiles.ts for the audit method.
    expect(AIRCRAFT_TILES).toHaveLength(108);
  });

  test("every tile has a valid (lat, lon) pair", () => {
    for (const [lat, lon] of AIRCRAFT_TILES) {
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
    }
  });

  test("global coverage spans both hemispheres", () => {
    const lats = AIRCRAFT_TILES.map(([lat]) => lat);
    const lons = AIRCRAFT_TILES.map(([, lon]) => lon);
    expect(Math.max(...lats)).toBeGreaterThan(50); // northern (Alaska, Scandinavia)
    expect(Math.min(...lats)).toBeLessThan(-30); // southern (NZ, Argentina)
    expect(Math.max(...lons)).toBeGreaterThan(150); // far-east (NZ, Australia)
    expect(Math.min(...lons)).toBeLessThan(-100); // far-west (Alaska, Pacific)
  });
});

// ── Constants ──────────────────────────────────────────────────────

describe("constants", () => {
  test("ADSB_BASE_URL is the v3 endpoint base", () => {
    expect(ADSB_BASE_URL).toBe("https://opendata.adsb.fi/api/v3");
  });

  test("aircraft requests retain the production rate-limit margin", () => {
    expect(AircraftSourcePolicy.RateLimitDelayMs).toBe(3_000);
  });

  test("rate-limit retries retain the default backoff", () => {
    expect(AircraftSourcePolicy.RetryDefaultDelayMs).toBe(30_000);
  });

  test("TILE_RADIUS_NM is at the v3 server cap of 250 (verified probe)", () => {
    expect(TILE_RADIUS_NM).toBe(250);
  });
});

// ── normalizeAdsbPayload ──────────────────────────────────────────

describe("normalizeAdsbPayload", () => {
  test("accepts { ac: [...] }", () => {
    const out = normalizeAdsbPayload({ ac: [{ hex: "abc" }] });
    expect(out).not.toBeNull();
    expect(out?.ac.length).toBe(1);
  });

  test("accepts an empty ac array", () => {
    const out = normalizeAdsbPayload({ ac: [] });
    expect(out).not.toBeNull();
    expect(out?.ac).toEqual([]);
  });

  test("rejects payloads without ac array", () => {
    expect(normalizeAdsbPayload({})).toBeNull();
    expect(normalizeAdsbPayload({ ac: "nope" })).toBeNull();
    expect(normalizeAdsbPayload({ ac: 42 })).toBeNull();
    expect(normalizeAdsbPayload({ ac: { hex: "x" } })).toBeNull();
  });

  test("rejects non-object inputs", () => {
    expect(normalizeAdsbPayload(null)).toBeNull();
    expect(normalizeAdsbPayload(undefined)).toBeNull();
    expect(normalizeAdsbPayload([])).toBeNull();
    expect(normalizeAdsbPayload("string")).toBeNull();
    expect(normalizeAdsbPayload(123)).toBeNull();
  });
});

// ── dedupByHex ─────────────────────────────────────────────────────

describe("dedupByHex", () => {
  test("merges duplicate hex entries (later wins)", () => {
    const result = dedupByHex([
      { hex: "abc", note: "first" },
      { hex: "def", note: "other" },
      { hex: "abc", note: "later wins" },
    ]);
    expect(result).toHaveLength(2);
    const found = result.find(
      (r) => (r as { hex: string }).hex.toLowerCase() === "abc",
    );
    expect((found as { note: string })?.note).toBe("later wins");
  });

  test("dedupes case-insensitively (AbC and abc are the same aircraft)", () => {
    const result = dedupByHex([{ hex: "AbC" }, { hex: "abc" }]);
    expect(result).toHaveLength(1);
  });

  test("drops records with no hex", () => {
    const result = dedupByHex([{ hex: "abc" }, {}, { hex: "" }, { hex: null }]);
    expect(result).toHaveLength(1);
  });

  test("preserves records with distinct hex", () => {
    const result = dedupByHex([
      { hex: "a1" },
      { hex: "b2" },
      { hex: "c3" },
      { hex: "d4" },
    ]);
    expect(result).toHaveLength(4);
  });
});

// ── AIRCRAFT_FIXTURE dev-only override ────────────────────────────

describe("resolveAircraftFixtureOverride", () => {
  test("returns null when fixture overrides disabled", async () => {
    expect(
      await resolveAircraftFixtureOverride({
        enabled: false,
        label: "test-snapshot",
      }),
    ).toBeNull();
  });

  test("returns null when no label is set", async () => {
    expect(
      await resolveAircraftFixtureOverride({
        enabled: true,
        label: undefined,
      }),
    ).toBeNull();
  });

  test("loads the fixture when enabled and label matches a real one", async () => {
    const result = await resolveAircraftFixtureOverride({
      enabled: true,
      label: "test-snapshot",
    });
    expect(result).not.toBeNull();
    const body = result?.body as { ac?: unknown[] } | undefined;
    expect(Array.isArray(body?.ac)).toBe(true);
    expect(body?.ac?.length).toBeGreaterThan(0);
  });

  test("rejects path-traversal labels", async () => {
    await expect(
      resolveAircraftFixtureOverride({
        enabled: true,
        label: "../../../etc/passwd",
      }),
    ).rejects.toThrow(/Invalid AIRCRAFT_FIXTURE/);
  });

  test("rejects shell-special and uppercase characters via regex allowlist", async () => {
    for (const bad of ["foo;bar", "foo$bar", "foo bar", "FOO", "../foo"]) {
      await expect(
        resolveAircraftFixtureOverride({ enabled: true, label: bad }),
      ).rejects.toThrow(/Invalid AIRCRAFT_FIXTURE/);
    }
  });

  test("throws fixture-not-found when the label is well-formed but the file is missing", async () => {
    await expect(
      resolveAircraftFixtureOverride({
        enabled: true,
        label: "totally-nonexistent-aircraft-fixture",
      }),
    ).rejects.toThrow(/Fixture not found/);
  });
});

// ── parseRetryAfter ──────────────────────────────────────────────

describe("parseRetryAfter", () => {
  test("parses a positive integer-seconds value", () => {
    expect(parseRetryAfter("10")).toBe(10);
    expect(parseRetryAfter("1")).toBe(1);
  });

  test("returns null for null / empty / zero / negative / non-numeric", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("")).toBeNull();
    expect(parseRetryAfter("0")).toBeNull();
    expect(parseRetryAfter("-5")).toBeNull();
    expect(parseRetryAfter("abc")).toBeNull();
  });
});

// ── fetchTileWithRetry ───────────────────────────────────────────

describe("fetchTileWithRetry", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    __resetAircraftCacheForTests();
  });

  test("retries once on 429 with default 5s delay when Retry-After absent", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) {
        return new Response("rate limited", {
          status: 429,
          headers: { "Content-Type": "text/plain" },
        });
      }
      return new Response(JSON.stringify({ ac: [{ hex: "abc" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;

    const sleeps: number[] = [];
    const result = await fetchTileWithRetry(40, -100, async (ms) => {
      sleeps.push(ms);
    });

    expect(calls).toBe(2);
    expect(sleeps).toEqual([30_000]);
    expect(result.kind).toBe("complete");
    if (result.kind !== "complete") throw new Error("Expected tile data");
    expect(result.records).toHaveLength(1);
  });

  test("honors Retry-After header in seconds", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) {
        return new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "10" },
        });
      }
      return new Response(JSON.stringify({ ac: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;

    const sleeps: number[] = [];
    const result = await fetchTileWithRetry(40, -100, async (ms) => {
      sleeps.push(ms);
    });

    expect(sleeps).toEqual([10_000]);
    expect(result).toEqual({ kind: "complete", records: [] });
  });

  test("reports retry exhaustion without pretending the tile was empty", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("rate limited", { status: 429 });
    }) as unknown as typeof globalThis.fetch;

    const result = await fetchTileWithRetry(40, -100, async () => {});
    expect(calls).toBe(2);
    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") throw new Error("Expected tile failure");
    expect(result.error.code).toBe(SourceErrorCode.RateLimited);
  });

  test("reports an HTTP failure without retrying", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("server error", { status: 500 });
    }) as unknown as typeof globalThis.fetch;

    const sleeps: number[] = [];
    const result = await fetchTileWithRetry(40, -100, async (ms) => {
      sleeps.push(ms);
    });
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") throw new Error("Expected tile failure");
    expect(result.error.code).toBe(SourceErrorCode.HttpError);
  });

  test("reports malformed success payloads as failures", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ aircraft: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof globalThis.fetch;

    const result = await fetchTileWithRetry(40, -100);
    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") throw new Error("Expected tile failure");
    expect(result.error.code).toBe(SourceErrorCode.InvalidPayload);
  });
});

describe("sweepTiles", () => {
  test("paces request starts without adding response time", async () => {
    const sleeps: number[] = [];
    let now = 0;
    const fetchFn = async (): Promise<AircraftTileResult> => {
      now += 2_000;
      return {
        kind: "complete",
        records: [{ hex: "x" }],
      };
    };

    await sweepTiles(
      [
        [1, 1],
        [2, 2],
        [3, 3],
      ],
      fetchFn,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
      () => now,
    );

    expect(sleeps).toEqual([1_000, 1_000]);
  });

  test("keeps records and completeness counts distinct", async () => {
    const fetchFn = async (
      latitude: number,
    ): Promise<AircraftTileResult> =>
      latitude === 1
        ? {
            kind: "complete",
            records: [{ hex: "tile-1" }],
          }
        : {
            kind: "failed",
            error: {
              code: SourceErrorCode.NetworkError,
              message: "offline",
            },
          };

    const result = await sweepTiles(
      [
        [1, 1],
        [2, 2],
      ],
      fetchFn,
      async () => {},
    );

    expect(result.records).toEqual([{ hex: "tile-1" }]);
    expect(result.successfulScopes).toBe(1);
    expect(result.failedScopes).toBe(1);
    expect(result.error?.code).toBe(SourceErrorCode.NetworkError);
  });
});

describe("runAircraftAcquisition", () => {
  test("runs one sweep at a time with one delay between sweeps", async () => {
    const controller = new AbortController();
    const sleeps: number[] = [];
    let activeSweeps = 0;
    let maxActiveSweeps = 0;
    let sweepCount = 0;

    await runAircraftAcquisition(
      controller.signal,
      async () => {
        activeSweeps++;
        maxActiveSweeps = Math.max(maxActiveSweeps, activeSweeps);
        await Promise.resolve();
        activeSweeps--;
        sweepCount++;
        if (sweepCount === 2) controller.abort();
      },
      async (ms) => {
        sleeps.push(ms);
      },
    );

    expect(sweepCount).toBe(2);
    expect(maxActiveSweeps).toBe(1);
    expect(sleeps).toEqual([AircraftSourcePolicy.RateLimitDelayMs]);
  });

  test("continues after an unexpected sweep failure", async () => {
    const controller = new AbortController();
    let sweepCount = 0;

    await runAircraftAcquisition(
      controller.signal,
      async () => {
        sweepCount++;
        if (sweepCount === 1) {
          throw new Error("test sweep failure");
        }
        controller.abort();
      },
      async () => {},
    );

    expect(sweepCount).toBe(2);
  });
});

// ── Streaming cache: ingestTile / finalizeSweep ──────────────────
// Per-tile streaming: each successful tile fetch merges into both
// `current` (this-sweep tracker, for end-of-sweep staleness pruning)
// and `completed` (what reads see). End-of-sweep prunes from `completed`
// any keys not seen this sweep, then resets `current` for the next.

describe("ingestTile", () => {
  test("merges records into both current and completed maps, keyed by lowercased hex", () => {
    const state: SweepState = createSweepState();
    ingestTile(state, [
      { hex: "AbC123", lat: 1, lon: 2 },
      { hex: "DEF456", lat: 3, lon: 4 },
    ]);
    expect(state.current.size).toBe(2);
    expect(state.completed.size).toBe(2);
    expect(state.completed.get("abc123")).toBeDefined();
    expect(state.completed.get("def456")).toBeDefined();
  });

  test("equal-time later records win case-insensitively", () => {
    const state = createSweepState();
    const receivedAt = 1_700_000_000_000;
    ingestTile(state, [{ hex: "abc", value: "first" }], receivedAt);
    ingestTile(state, [{ hex: "ABC", value: "second" }], receivedAt);

    const merged = state.completed.get("abc");
    expect(state.completed.size).toBe(1);
    expect(isRecord(merged)).toBe(true);
    if (!isRecord(merged)) throw new Error("Expected cached record");
    expect(merged.value).toBe("second");
  });

  test("an older overlapping tile cannot replace a fresher position", () => {
    const state = createSweepState();
    const receivedAt = 1_700_000_000_000;
    ingestTile(
      state,
      [{ hex: "abc", seen_pos: 20, value: "older" }],
      receivedAt,
    );
    ingestTile(
      state,
      [{ hex: "ABC", seen_pos: 2, value: "newer" }],
      receivedAt,
    );
    ingestTile(
      state,
      [{ hex: "abc", seen_pos: 30, value: "oldest" }],
      receivedAt,
    );

    const merged = state.completed.get("abc");
    expect(isRecord(merged)).toBe(true);
    if (!isRecord(merged)) throw new Error("Expected cached record");
    expect(merged.value).toBe("newer");
    expect(merged.observedAt).toBe(receivedAt - 2_000);
  });

  test("drops records without a usable hex string", () => {
    const state = createSweepState();
    ingestTile(state, [
      { hex: "abc" },
      {},
      { hex: "" },
      { hex: null },
      { hex: 42 },
      null,
      "string",
    ] as unknown[]);
    expect(state.completed.size).toBe(1);
  });

  test("progressive cold start: completed grows tile-by-tile during a sweep", () => {
    const state = createSweepState();
    ingestTile(state, [{ hex: "tile1-a" }, { hex: "tile1-b" }]);
    expect(state.completed.size).toBe(2);
    ingestTile(state, [{ hex: "tile2-a" }]);
    expect(state.completed.size).toBe(3);
    ingestTile(state, [{ hex: "tile3-a" }, { hex: "tile3-b" }]);
    expect(state.completed.size).toBe(5);
  });

  test("completed reflects reads from any point during the sweep (no mid-merge state visible)", () => {
    // The "atomic swap" guarantee: after each ingestTile call returns,
    // completed contains a fully merged view. There is no observable
    // intermediate state in single-threaded JS — but verify the post-
    // condition explicitly so the contract is locked down.
    const state = createSweepState();
    const beforeFirst = state.completed.size;
    expect(beforeFirst).toBe(0);
    ingestTile(state, [{ hex: "a" }, { hex: "b" }, { hex: "c" }]);
    expect(state.completed.size).toBe(3);
    expect(state.completed.has("a")).toBe(true);
    expect(state.completed.has("b")).toBe(true);
    expect(state.completed.has("c")).toBe(true);
  });
});

describe("finalizeSweep", () => {
  test("prunes stale aircraft (in completed but not seen this sweep)", () => {
    const state = createSweepState();
    // Pretend a previous sweep populated completed
    state.completed.set("stale-1", { hex: "stale-1" });
    state.completed.set("stale-2", { hex: "stale-2" });
    state.completed.set("seen-this-sweep", { hex: "seen-this-sweep" });

    // This sweep only saw the third one
    ingestTile(state, [{ hex: "seen-this-sweep" }, { hex: "new-1" }]);
    finalizeSweep(state, SourceCompleteness.Complete);

    expect(state.completed.has("stale-1")).toBe(false);
    expect(state.completed.has("stale-2")).toBe(false);
    expect(state.completed.has("seen-this-sweep")).toBe(true);
    expect(state.completed.has("new-1")).toBe(true);
  });

  test("empty sweep retains stale data (all-fail protection)", () => {
    const state = createSweepState();
    state.completed.set("warm-1", { hex: "warm-1" });
    state.completed.set("warm-2", { hex: "warm-2" });
    finalizeSweep(state, SourceCompleteness.Unknown);
    expect(state.completed.size).toBe(2);
  });

  test("resets current for the next sweep so prior tiles do not pollute prune", () => {
    const state = createSweepState();
    ingestTile(state, [{ hex: "a" }, { hex: "b" }]);
    finalizeSweep(state, SourceCompleteness.Complete);
    expect(state.current.size).toBe(0);
    ingestTile(state, [{ hex: "a" }]);
    finalizeSweep(state, SourceCompleteness.Complete);
    expect(state.completed.has("a")).toBe(true);
    expect(state.completed.has("b")).toBe(false);
  });
});

// ── Initial cache state ──────────────────────────────────────────
describe("runSweep source state", () => {
  const noSleep = async (): Promise<void> => {};

  afterEach(() => {
    __resetAircraftCacheForTests();
  });

  test("paces tile starts without adding response latency", async () => {
    const sleeps: number[] = [];
    let now = 0;

    await runSweep(
      async () => {
        now += 2_000;
        return { kind: "complete", records: [] };
      },
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
      () => now,
    );

    expect(sleeps).toHaveLength(AIRCRAFT_TILES.length - 1);
    expect(sleeps.every((delay) => delay === 1_000)).toBe(true);
  });

  test("a complete empty sweep authoritatively clears the prior snapshot", async () => {
    await runSweep(
      async () => ({
        kind: "complete",
        records: [{ hex: "warm-aircraft" }],
      }),
      noSleep,
    );
    expect(getAircraftCache().aircraftCount).toBe(1);

    await runSweep(
      async () => ({ kind: "complete", records: [] }),
      noSleep,
    );

    const cache = getAircraftCache();
    expect(cache.body).toEqual({ ac: [] });
    expect(cache.aircraftCount).toBe(0);
    expect(cache.source.phase).toBe(SourcePhase.Ready);
    expect(cache.source.completeness).toBe(SourceCompleteness.Complete);
    expect(cache.source.successfulScopes).toBe(AIRCRAFT_TILES.length);
    expect(cache.source.failedScopes).toBe(0);
  });

  test("a partial sweep retains aircraft absent from failed tiles", async () => {
    await runSweep(
      async () => ({
        kind: "complete",
        records: [{ hex: "warm-aircraft" }],
      }),
      noSleep,
    );

    let calls = 0;
    await runSweep(
      async () => {
        calls++;
        return calls === 1
          ? { kind: "complete", records: [] }
          : {
              kind: "failed",
              error: {
                code: SourceErrorCode.NetworkError,
                message: "offline",
              },
            };
      },
      noSleep,
    );

    const cache = getAircraftCache();
    expect(cache.aircraftCount).toBe(1);
    expect(cache.source.phase).toBe(SourcePhase.Degraded);
    expect(cache.source.completeness).toBe(SourceCompleteness.Partial);
    expect(cache.source.successfulScopes).toBe(1);
    expect(cache.source.failedScopes).toBe(AIRCRAFT_TILES.length - 1);
    expect(cache.source.error?.code).toBe(SourceErrorCode.NetworkError);
  });

  test("an unavailable sweep retains the warm snapshot without inferring absence", async () => {
    await runSweep(
      async () => ({
        kind: "complete",
        records: [{ hex: "warm-aircraft" }],
      }),
      noSleep,
    );

    await runSweep(
      async () => ({
        kind: "failed",
        error: {
          code: SourceErrorCode.RateLimited,
          message: "limited",
        },
      }),
      noSleep,
    );

    const cache = getAircraftCache();
    expect(cache.aircraftCount).toBe(1);
    expect(cache.source.phase).toBe(SourcePhase.Unavailable);
    expect(cache.source.completeness).toBe(SourceCompleteness.Unknown);
    expect(cache.source.successfulScopes).toBe(0);
    expect(cache.source.failedScopes).toBe(AIRCRAFT_TILES.length);
  });
});


describe("getAircraftCache", () => {
  test("returns the initial empty shape before any fetch", () => {
    const c = getAircraftCache();
    expect(c.body).toBeNull();
    expect(c.fetchedAt).toBe(0);
    expect(c.aircraftCount).toBe(0);
    expect(c.error).toBeNull();
    expect(c.source.phase).toBe(SourcePhase.Cold);
    expect(c.source.freshness).toBe(SourceFreshness.Expired);
    expect(c.source.completeness).toBe(SourceCompleteness.Unknown);
  });
});
