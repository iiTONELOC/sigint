import { type PointType } from "@shared/domain/pointType";
import { Domain } from "@shared/domain/identity";
// ── Event rolling window ────────────────────────────────────────────
// GDELT publishes only the newest export every fifteen minutes, so the
// seven-day view is rebuilt on each poll: retained entries still inside the
// window, plus the incoming batch. This replaced BaseProvider's mergeFn.

import { describe, expect, test } from "bun:test";
import {
  EVENT_WINDOW_MS,
  mergeEventWindow,
} from "@/workers/data/sources/events";
import type { EventPoint } from "@/features/intel/events/data/codec";

const NOW = 1_800_000_000_000;

function event(id: string, agedMs: number): EventPoint {
  return {
    id,
    type: Domain.Events,
    lat: 1,
    lon: 2,
    timestamp: new Date(NOW - agedMs).toISOString(),
    data: { headline: id, severity: 1 },
  };
}

const ids = (points: readonly EventPoint[]): string[] =>
  points.map((point) => point.id).sort((a, b) => a.localeCompare(b));

describe("mergeEventWindow", () => {
  test("keeps retained entries inside the window", () => {
    const retained = [event("A", 0), event("B", EVENT_WINDOW_MS / 2)];
    expect(ids(mergeEventWindow(retained, [], NOW))).toEqual(["A", "B"]);
  });

  test("drops retained entries past the window", () => {
    const retained = [event("A", 0), event("OLD", EVENT_WINDOW_MS + 1)];
    expect(ids(mergeEventWindow(retained, [], NOW))).toEqual(["A"]);
  });

  test("keeps an entry exactly on the boundary", () => {
    const retained = [event("EDGE", EVENT_WINDOW_MS)];
    expect(ids(mergeEventWindow(retained, [], NOW))).toEqual(["EDGE"]);
  });

  test("adds incoming entries", () => {
    const merged = mergeEventWindow([event("A", 0)], [event("B", 0)], NOW);
    expect(ids(merged)).toEqual(["A", "B"]);
  });

  test("incoming wins on a repeated id", () => {
    const retained = [event("A", 0)];
    const incoming: EventPoint[] = [
      { ...event("A", 0), data: { headline: "updated", severity: 4 } },
    ];
    const merged = mergeEventWindow(retained, incoming, NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.data.headline).toBe("updated");
  });

  test("admits incoming entries regardless of age", () => {
    // The window bounds retention, not intake; the feed decides what is new.
    const incoming = [event("OLD", EVENT_WINDOW_MS * 2)];
    expect(ids(mergeEventWindow([], incoming, NOW))).toEqual(["OLD"]);
  });

  test("treats a missing timestamp as outside the window", () => {
    const undated: EventPoint = {
      id: "NO_TS",
      type: Domain.Events,
      lat: 0,
      lon: 0,
      data: {},
    };
    expect(mergeEventWindow([undated], [], NOW)).toHaveLength(0);
  });
});
