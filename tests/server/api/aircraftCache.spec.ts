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
  POLL_INTERVAL_MS,
  RATE_LIMIT_DELAY_MS,
  RETRY_DEFAULT_DELAY_MS,
  TILE_RADIUS_NM,
  dedupByHex,
  normalizeAdsbPayload,
  parseRetryAfter,
  shuffleTiles,
  fetchTileWithRetry,
  sweepTiles,
  resolveAircraftFixtureOverride,
  getAircraftCache,
  createSweepState,
  ingestTile,
  finalizeSweep,
  type SweepState,
} from "../../../src/server/api/aircraftCache";

// ── Tile coverage ──────────────────────────────────────────────────

describe("AIRCRAFT_TILES", () => {
  test("ships exactly 108 tiles (post tile-coverage audit — see commit body)", () => {
    // Audit dropped 6 structurally-dead tiles (Ukraine war zone,
    // Iraq/Iran restricted airspace, Chinese ADS-B publishing
    // restrictions in 3 Beijing-region tiles) and added 1 (Hawaii,
    // previously uncovered Pacific hub). Net: 113 → 108. See
    // scripts/probe-aircraft-tiles.ts for the audit method.
    expect(AIRCRAFT_TILES.length).toBe(108);
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

  test("POLL_INTERVAL_MS is 300s (sweep wake cadence, sweep duration may exceed)", () => {
    expect(POLL_INTERVAL_MS).toBe(300_000);
  });

  test("RATE_LIMIT_DELAY_MS is 3000ms — extended from 2000 after sustained 429s in production", () => {
    expect(RATE_LIMIT_DELAY_MS).toBe(3_000);
  });

  test("RETRY_DEFAULT_DELAY_MS is 30s when 429 has no Retry-After header", () => {
    expect(RETRY_DEFAULT_DELAY_MS).toBe(30_000);
  });

  test("TILE_RADIUS_NM is at the v3 server cap of 250 (verified probe)", () => {
    expect(TILE_RADIUS_NM).toBe(250);
  });

  test("sweep duration may exceed POLL_INTERVAL_MS by design (sweepInProgress guard prevents overlap)", () => {
    const sweepMs = AIRCRAFT_TILES.length * RATE_LIMIT_DELAY_MS;
    // 108 × 3000 = 324s, still exceeds the 300s wake cadence even
    // post-audit. The fetchAircraft function must guard against
    // re-entry so setInterval kicks during an in-flight sweep are
    // skipped rather than launching a parallel sweep.
    expect(sweepMs).toBeGreaterThan(POLL_INTERVAL_MS);
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
    expect(result.length).toBe(2);
    const found = result.find(
      (r) => (r as { hex: string }).hex.toLowerCase() === "abc",
    );
    expect((found as { note: string })?.note).toBe("later wins");
  });

  test("dedupes case-insensitively (AbC and abc are the same aircraft)", () => {
    const result = dedupByHex([{ hex: "AbC" }, { hex: "abc" }]);
    expect(result.length).toBe(1);
  });

  test("drops records with no hex", () => {
    const result = dedupByHex([{ hex: "abc" }, {}, { hex: "" }, { hex: null }]);
    expect(result.length).toBe(1);
  });

  test("preserves records with distinct hex", () => {
    const result = dedupByHex([
      { hex: "a1" },
      { hex: "b2" },
      { hex: "c3" },
      { hex: "d4" },
    ]);
    expect(result.length).toBe(4);
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

// ── shuffleTiles ─────────────────────────────────────────────────

describe("shuffleTiles", () => {
  test("preserves length and contents", () => {
    const input: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ];
    const out = shuffleTiles(input);
    expect(out.length).toBe(input.length);
    const inputSet = new Set(input.map((t) => `${t[0]},${t[1]}`));
    const outSet = new Set(out.map((t) => `${t[0]},${t[1]}`));
    expect(outSet).toEqual(inputSet);
  });

  test("does not mutate the input array", () => {
    const input: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [1, 1],
      [2, 2],
    ];
    const before = JSON.stringify(input);
    shuffleTiles(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  test("produces different orderings across multiple sweeps", () => {
    // 113 tiles → 113! permutations; collision probability negligible.
    // Sample 5 sweeps; require at least two distinct orderings.
    const tiles = AIRCRAFT_TILES;
    const orderings = new Set<string>();
    for (let i = 0; i < 5; i++) {
      orderings.add(
        shuffleTiles(tiles)
          .map(([a, b]) => `${a},${b}`)
          .join("|"),
      );
    }
    expect(orderings.size).toBeGreaterThan(1);
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
    expect(result.length).toBe(1);
  });

  test("honors Retry-After header (in seconds)", async () => {
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
    await fetchTileWithRetry(40, -100, async (ms) => {
      sleeps.push(ms);
    });

    expect(sleeps).toEqual([10_000]);
  });

  test("two 429s in a row → return [] without throwing (skip this tile)", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("rate limited", { status: 429 });
    }) as unknown as typeof globalThis.fetch;

    const result = await fetchTileWithRetry(40, -100, async () => {});
    expect(calls).toBe(2);
    expect(result).toEqual([]);
  });

  test("non-429 error response → return [] without retry", async () => {
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
    expect(result).toEqual([]);
  });
});

// ── sweepTiles ───────────────────────────────────────────────────

describe("sweepTiles", () => {
  test("uses RATE_LIMIT_DELAY_MS (3000ms) between successful tiles, none after the last", async () => {
    const sleeps: number[] = [];
    const fetchFn = async () => [{ hex: "x" }];
    await sweepTiles(
      [
        [1, 1],
        [2, 2],
        [3, 3],
      ],
      fetchFn,
      async (ms) => {
        sleeps.push(ms);
      },
    );
    // 3 tiles → 2 inter-tile delays, no trailing sleep
    expect(sleeps).toEqual([3_000, 3_000]);
  });

  test("merges aircraft from each tile in order called", async () => {
    const fetchFn = async (lat: number) => [{ hex: `tile-${lat}` }];
    const merged = await sweepTiles(
      [
        [1, 1],
        [2, 2],
      ],
      fetchFn,
      async () => {},
    );
    expect(merged).toEqual([{ hex: "tile-1" }, { hex: "tile-2" }]);
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

  test("later records win (case-insensitive on hex)", () => {
    const state = createSweepState();
    ingestTile(state, [{ hex: "abc", v: "first" }]);
    ingestTile(state, [{ hex: "ABC", v: "second" }]);
    expect(state.completed.size).toBe(1);
    const merged = state.completed.get("abc") as { v?: string } | undefined;
    expect(merged?.v).toBe("second");
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
    finalizeSweep(state);

    expect(state.completed.has("stale-1")).toBe(false);
    expect(state.completed.has("stale-2")).toBe(false);
    expect(state.completed.has("seen-this-sweep")).toBe(true);
    expect(state.completed.has("new-1")).toBe(true);
  });

  test("empty sweep retains stale data (all-fail protection)", () => {
    const state = createSweepState();
    state.completed.set("warm-1", { hex: "warm-1" });
    state.completed.set("warm-2", { hex: "warm-2" });
    // No ingestTile calls — sweep produced nothing (e.g. all 429s)
    finalizeSweep(state);
    expect(state.completed.size).toBe(2);
  });

  test("resets current for the next sweep so prior tiles do not pollute prune", () => {
    const state = createSweepState();
    ingestTile(state, [{ hex: "a" }, { hex: "b" }]);
    finalizeSweep(state);
    expect(state.current.size).toBe(0);
    // Next sweep: only sees "a", b should be pruned
    ingestTile(state, [{ hex: "a" }]);
    finalizeSweep(state);
    expect(state.completed.has("a")).toBe(true);
    expect(state.completed.has("b")).toBe(false);
  });
});

// ── Initial cache state ──────────────────────────────────────────

describe("getAircraftCache", () => {
  test("returns the initial empty shape before any fetch", () => {
    const c = getAircraftCache();
    expect(c.body).toBeNull();
    expect(c.fetchedAt).toBe(0);
    expect(c.aircraftCount).toBe(0);
    expect(c.error).toBeNull();
  });
});
