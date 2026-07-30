// trailService initTrails merge contract
// Bug fix: `initTrails()` previously did `trails = cached`, replacing
// the live Map and silently dropping any positions `recordPositions`
// had already written during the boot race. The new contract MERGES
// cached history into the live Map so both directions are preserved.
//
// These tests target the pure `mergeCachedTrails(live, cached)` helper
// extracted from initTrails. No async or IDB, only Map to Map math.

import { describe, test, expect } from "bun:test";
import { Domain } from "../../src/shared/domain/identity";
import { TestInstant } from "../_support";
import {
  mergeCachedTrails,
  type TrailEntry,
} from "../../src/client/lib/geo/trails/trailStore";

function mkPoint(ts: number, lat = 0, lon = 0) {
  return { lat, lon, ts };
}

function mkEntry(
  points: Array<{ lat: number; lon: number; ts: number }>,
  type: TrailEntry["type"] = Domain.Aircraft,
): TrailEntry {
  return {
    type,
    points,
    lastSeen: points[points.length - 1]?.ts ?? 0,
    heading: 0,
    speedMps: 0,
  };
}

describe("mergeCachedTrails", () => {
  test("empty live Map: cached entries are installed verbatim", () => {
    const live = new Map<string, TrailEntry>();
    const cached = new Map<string, TrailEntry>([
      ["A1", mkEntry([mkPoint(100), mkPoint(200)])],
      ["S2", mkEntry([mkPoint(150)], Domain.Ships)],
    ]);

    mergeCachedTrails(live, cached);

    expect(live.size).toBe(2);
    expect(live.get("A1")?.points.length).toBe(2);
    expect(live.get("S2")?.points.length).toBe(1);
  });

  test("empty cached Map: live is untouched", () => {
    const live = new Map<string, TrailEntry>([
      ["A1", mkEntry([mkPoint(500)])],
    ]);
    const before = live.get("A1")?.points.length;

    mergeCachedTrails(live, new Map());

    expect(live.get("A1")?.points.length).toBe(before);
  });

  test("id present in both: cached points (older) prepended to live points", () => {
    // Live entry has one fresh point at ts=1000 (just-recorded during boot).
    // Cached has historical points at ts=100, 200, 300 (older).
    // Expected result: [100, 200, 300, 1000], full history preserved.
    const live = new Map<string, TrailEntry>([
      ["A1", mkEntry([mkPoint(1000)])],
    ]);
    const cached = new Map<string, TrailEntry>([
      ["A1", mkEntry([mkPoint(100), mkPoint(200), mkPoint(300)])],
    ]);

    mergeCachedTrails(live, cached);

    const merged = live.get("A1")!.points;
    expect(merged.length).toBe(4);
    expect(merged.map((p) => p.ts)).toEqual([100, 200, 300, 1000]);
  });

  test("cached points NEWER than earliest live point are dropped (avoid future-history paradox)", () => {
    // Live has ts=200 (just-recorded). Cached has ts=100, 300.
    // ts=100 is older than live's earliest (200) → prepend.
    // ts=300 is newer than live's earliest → dropped (live's 200 is fresher
    //   than what the cache last knew about; the post-boot recording
    //   pipeline owns the timeline from earliest-live onward).
    const live = new Map<string, TrailEntry>([
      ["A1", mkEntry([mkPoint(200)])],
    ]);
    const cached = new Map<string, TrailEntry>([
      ["A1", mkEntry([mkPoint(100), mkPoint(300)])],
    ]);

    mergeCachedTrails(live, cached);

    const merged = live.get("A1")!.points;
    expect(merged.map((p) => p.ts)).toEqual([100, 200]);
  });

  test("aircraft trail respects the production cap after merge", () => {
    const live = new Map<string, TrailEntry>([
      ["A1", mkEntry([mkPoint(TestInstant.TrailNow)])],
    ]);
    const cachedPoints = Array.from({ length: 180 }, (_, index) =>
      mkPoint(index * 100),
    );
    const cached = new Map<string, TrailEntry>([["A1", mkEntry(cachedPoints)]]);

    mergeCachedTrails(live, cached);

    const merged = live.get("A1")!.points;
    expect(merged.length).toBe(120);
    expect(merged.at(-1)?.ts).toBe(TestInstant.TrailNow);
    expect(merged[0]?.ts).toBe(61 * 100);
  });

  test("ships trail respects 500-point cap after merge", () => {
    const live = new Map<string, TrailEntry>([
      [
        "S1",
        mkEntry([mkPoint(TestInstant.TrailNow)], Domain.Ships),
      ],
    ]);
    const cachedPoints = Array.from({ length: 600 }, (_, i) =>
      mkPoint(i * 100),
    );
    const cached = new Map<string, TrailEntry>([
      ["S1", mkEntry(cachedPoints, Domain.Ships)],
    ]);

    mergeCachedTrails(live, cached);

    expect(live.get("S1")!.points.length).toBe(500);
  });

  test("entries unique to cached are installed (not currently in live data)", () => {
    // recordPositions only added A1; cached has A1 + A2.
    // A2 must survive so its history is available when the aircraft
    // re-appears in a future poll.
    const live = new Map<string, TrailEntry>([
      ["A1", mkEntry([mkPoint(500)])],
    ]);
    const cached = new Map<string, TrailEntry>([
      ["A1", mkEntry([mkPoint(100)])],
      ["A2", mkEntry([mkPoint(50)])],
    ]);

    mergeCachedTrails(live, cached);

    expect(live.has("A2")).toBe(true);
    expect(live.get("A2")!.points[0]?.ts).toBe(50);
  });

  test("entries unique to live are untouched", () => {
    const live = new Map<string, TrailEntry>([
      ["A1", mkEntry([mkPoint(500)])],
      ["A3", mkEntry([mkPoint(700)])],
    ]);
    const cached = new Map<string, TrailEntry>([
      ["A1", mkEntry([mkPoint(100)])],
    ]);

    mergeCachedTrails(live, cached);

    expect(live.get("A3")!.points.length).toBe(1);
    expect(live.get("A3")!.points[0]?.ts).toBe(700);
  });

  test("live entry with empty points: cached entry replaces it", () => {
    // A live entry can theoretically have zero points if
    // recordPositions never appended (e.g. minMoveDeg gate). Treat as
    // "no live history" and use cached wholesale.
    const live = new Map<string, TrailEntry>([
      ["A1", mkEntry([])],
    ]);
    const cached = new Map<string, TrailEntry>([
      ["A1", mkEntry([mkPoint(100), mkPoint(200)])],
    ]);

    mergeCachedTrails(live, cached);

    expect(live.get("A1")!.points.length).toBe(2);
  });
});
