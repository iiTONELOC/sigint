// ── Aircraft cold-start priority tile ordering on first sweep ──
// Verifies the ranked tiles are walked on the first sweep after process
// start. Later sweeps retain the declared tile order.

import { describe, test, expect, afterEach } from "bun:test";
import {
  AIRCRAFT_TILES,
  AircraftTileResultKind,
  buildFirstSweepOrder,
  runSweep,
  __resetFirstSweepForTests,
  __resetAircraftCacheForTests,
  type AircraftTileResult,
} from "../../../src/server/api/aircraftCache";
import type { AircraftTile } from "../../../src/server/api/aircraftTiles";

// runSweep mutates module-level state (`sweepState`, `lastFetchedAt`,
// `lastError`). Full reset between tests prevents this file's runs
// from polluting state for other specs.
afterEach(() => {
  __resetAircraftCacheForTests();
});

// Tuple equality matching `buildFirstSweepOrder`'s declared contract.
function sameTile(
  a: AircraftTile,
  b: AircraftTile,
): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

describe("AIRCRAFT_TILES first-sweep ranks", () => {
  test("every first-sweep rank is an integer", () => {
    const ranked = AIRCRAFT_TILES.filter(([, , rank]) => rank !== undefined);
    for (const [, , rank] of ranked) {
      expect(Number.isInteger(rank)).toBe(true);
    }
  });

  test("contains no duplicate ranks", () => {
    const ranked = AIRCRAFT_TILES.filter(([, , rank]) => rank !== undefined);
    for (let i = 0; i < ranked.length; i++) {
      const a = ranked[i];
      if (!a) continue;
      for (let j = i + 1; j < ranked.length; j++) {
        const b = ranked[j];
        if (!b) continue;
        expect(a[2]).not.toBe(b[2]);
      }
    }
  });

  test("ships exactly 20 ranked tiles", () => {
    expect(
      AIRCRAFT_TILES.filter(([, , rank]) => rank !== undefined),
    ).toHaveLength(20);
  });
});

describe("buildFirstSweepOrder", () => {
  test("emits ranked tiles first, in rank order", () => {
    const order = buildFirstSweepOrder(AIRCRAFT_TILES);
    const ranked = AIRCRAFT_TILES
      .filter(([, , rank]) => rank !== undefined)
      .sort(
        (a, b) =>
          (a[2] ?? Number.MAX_SAFE_INTEGER) -
          (b[2] ?? Number.MAX_SAFE_INTEGER),
      );
    for (let i = 0; i < ranked.length; i++) {
      const o = order[i];
      const p = ranked[i];
      if (!o || !p) throw new Error("unexpected gap in priority order");
      expect(sameTile(o, p)).toBe(true);
    }
  });

  test("never emits a tile twice (priority + tail disjoint)", () => {
    const order = buildFirstSweepOrder(AIRCRAFT_TILES);
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
    const order = buildFirstSweepOrder(AIRCRAFT_TILES);
    expect(order).toHaveLength(AIRCRAFT_TILES.length);
  });

  test("tail retains the declared tile order", () => {
    const order = buildFirstSweepOrder(AIRCRAFT_TILES);
    // Build the expected tail by walking AIRCRAFT_TILES in declared
    // order, skipping tiles that carry a first-sweep rank.
    const expectedTail = AIRCRAFT_TILES.filter(
      ([, , rank]) => rank === undefined,
    );
    const actualTail = order.slice(AIRCRAFT_TILES.length - expectedTail.length);
    expect(actualTail).toHaveLength(expectedTail.length);
    for (let i = 0; i < actualTail.length; i++) {
      const a = actualTail[i];
      const e = expectedTail[i];
      if (!a || !e) throw new Error("unexpected gap in tail");
      expect(sameTile(a, e)).toBe(true);
    }
  });
});

function recordingFetch(visits: AircraftTile[]) {
  return async (lat: number, lon: number): Promise<AircraftTileResult> => {
    visits.push([lat, lon]);
    return { kind: AircraftTileResultKind.Complete, records: [] };
  };
}

function tileKey([lat, lon]: AircraftTile): string {
  return `${lat},${lon}`;
}

const noSleep = async (): Promise<void> => {};

describe("runSweep priority ordering", () => {
  test("first sweep walks the ranked order", async () => {
    __resetFirstSweepForTests();
    const visits: AircraftTile[] = [];

    await runSweep(recordingFetch(visits), noSleep);

    expect(visits.map(tileKey)).toEqual(buildFirstSweepOrder(AIRCRAFT_TILES).map(tileKey));
  });

  test("later sweeps walk the declared order", async () => {
    __resetFirstSweepForTests();
    await runSweep(recordingFetch([]), noSleep);
    const second: AircraftTile[] = [];
    await runSweep(recordingFetch(second), noSleep);

    expect(second.map(tileKey)).toEqual(AIRCRAFT_TILES.map(tileKey));
  });
});
