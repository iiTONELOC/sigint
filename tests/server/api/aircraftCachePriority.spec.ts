// ── Aircraft cold-start UX — priority tile ordering on first sweep ──
// Verifies the hand-ordered priority list is walked on the very first
// sweep after process start so cold-start visitors see CONUS / EU /
// APAC hubs first. Later sweeps retain a stable declared order.

import { describe, test, expect, afterEach } from "bun:test";
import {
  AIRCRAFT_TILES,
  PRIORITY_TILES,
  buildFirstSweepOrder,
  runSweep,
  __resetFirstSweepForTests,
  __resetAircraftCacheForTests,
  type AircraftTileResult,
} from "../../../src/server/api/aircraftCache";

// runSweep mutates module-level state (`sweepState`, `lastFetchedAt`,
// `lastError`). Full reset between tests prevents this file's runs
// from polluting state for other specs.
afterEach(() => {
  __resetAircraftCacheForTests();
});

// Tuple equality matching `buildFirstSweepOrder`'s declared contract.
function sameTile(
  a: readonly [number, number],
  b: readonly [number, number],
): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

describe("PRIORITY_TILES", () => {
  test("every priority tile exists in AIRCRAFT_TILES (exact tuple match)", () => {
    for (const p of PRIORITY_TILES) {
      const found = AIRCRAFT_TILES.some((t) => sameTile(t, p));
      expect(found).toBe(true);
    }
  });

  test("contains no duplicate tuples", () => {
    for (let i = 0; i < PRIORITY_TILES.length; i++) {
      const a = PRIORITY_TILES[i];
      if (!a) continue;
      for (let j = i + 1; j < PRIORITY_TILES.length; j++) {
        const b = PRIORITY_TILES[j];
        if (!b) continue;
        expect(sameTile(a, b)).toBe(false);
      }
    }
  });

  test("ships exactly 20 priority tiles", () => {
    expect(PRIORITY_TILES).toHaveLength(20);
  });
});

describe("buildFirstSweepOrder", () => {
  test("emits priority tiles first, in declared order", () => {
    const order = buildFirstSweepOrder(PRIORITY_TILES, AIRCRAFT_TILES);
    for (let i = 0; i < PRIORITY_TILES.length; i++) {
      const o = order[i];
      const p = PRIORITY_TILES[i];
      if (!o || !p) throw new Error("unexpected gap in priority order");
      expect(sameTile(o, p)).toBe(true);
    }
  });

  test("never emits a tile twice (priority + tail disjoint)", () => {
    const order = buildFirstSweepOrder(PRIORITY_TILES, AIRCRAFT_TILES);
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      if (!a) continue;
      for (let j = i + 1; j < order.length; j++) {
        const b = order[j];
        if (!b) continue;
        expect(sameTile(a, b)).toBe(false);
      }
    }
  });

  test("total length equals AIRCRAFT_TILES.length exactly", () => {
    const order = buildFirstSweepOrder(PRIORITY_TILES, AIRCRAFT_TILES);
    expect(order).toHaveLength(AIRCRAFT_TILES.length);
  });

  test("tail retains the declared tile order", () => {
    const order = buildFirstSweepOrder(PRIORITY_TILES, AIRCRAFT_TILES);
    // Build the expected tail by walking AIRCRAFT_TILES in declared
    // order, skipping any tile that's in PRIORITY_TILES.
    const expectedTail = AIRCRAFT_TILES.filter(
      (t) => !PRIORITY_TILES.some((p) => sameTile(t, p)),
    );
    const actualTail = order.slice(PRIORITY_TILES.length);
    expect(actualTail).toHaveLength(expectedTail.length);
    for (let i = 0; i < actualTail.length; i++) {
      const a = actualTail[i];
      const e = expectedTail[i];
      if (!a || !e) throw new Error("unexpected gap in tail");
      expect(sameTile(a, e)).toBe(true);
    }
  });
});

describe("runSweep priority ordering", () => {
  test("first invocation visits tiles in buildFirstSweepOrder order", async () => {
    __resetFirstSweepForTests();
    const visited: Array<[number, number]> = [];
    const fetchFn = async (
      lat: number,
      lon: number,
    ): Promise<AircraftTileResult> => {
      visited.push([lat, lon]);
      return { kind: "complete", records: [] };
    };
    const sleep = async (): Promise<void> => {};

    await runSweep(fetchFn, sleep);

    const expected = buildFirstSweepOrder(PRIORITY_TILES, AIRCRAFT_TILES);
    expect(visited).toHaveLength(expected.length);
    for (let i = 0; i < visited.length; i++) {
      const v = visited[i];
      const e = expected[i];
      if (!v || !e) throw new Error("unexpected gap in visited order");
      expect(sameTile(v, e)).toBe(true);
    }
  });

  test("later invocations use stable declared order", async () => {
    __resetFirstSweepForTests();
    const noopFetch = async (): Promise<AircraftTileResult> => ({
      kind: "complete",
      records: [],
    });
    const sleep = async (): Promise<void> => {};

    await runSweep(noopFetch, sleep);

    const secondVisited: Array<[number, number]> = [];
    const recordingFetch = async (
      lat: number,
      lon: number,
    ): Promise<AircraftTileResult> => {
      secondVisited.push([lat, lon]);
      return { kind: "complete", records: [] };
    };

    await runSweep(recordingFetch, sleep);

    const thirdVisited: Array<[number, number]> = [];
    await runSweep(
      async (lat, lon) => {
        thirdVisited.push([lat, lon]);
        return { kind: "complete", records: [] };
      },
      sleep,
    );

    expect(secondVisited).toHaveLength(AIRCRAFT_TILES.length);
    expect(thirdVisited).toEqual(secondVisited);
    for (let i = 0; i < secondVisited.length; i++) {
      const v = secondVisited[i];
      const t = AIRCRAFT_TILES[i];
      if (!v || !t) throw new Error("unexpected gap in visited order");
      expect(sameTile(v, t)).toBe(true);
    }
  });
});
